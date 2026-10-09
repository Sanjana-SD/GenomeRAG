import contextlib
import contextvars
import math
import os
import threading
import time
import uuid
from typing import List, Dict, Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance

import genome.config  # noqa: F401  (loads .env)
from genome.genome import MemoryGenome
from genome.embeddings import get_embedding, EMBEDDING_DIM

# --- Memory namespaces -------------------------------------------------------
# Every workload gets its own Qdrant collection so that one can never read or
# wipe another's memories:
#   CHAT_COLLECTION      - the evolved/custom chat agent (the original collection)
#   BASELINE_COLLECTION  - the fixed-memory baseline chat agent
#   BENCHMARK_COLLECTION - benchmark / evolution scratch space (wiped per task)
#   TEST_COLLECTION      - developer test scripts
CHAT_COLLECTION = "genomerag_memories"
BASELINE_COLLECTION = "genomerag_baseline_memories"
BENCHMARK_COLLECTION = "genomerag_benchmark"
TEST_COLLECTION = "genomerag_test"

# Chat collections hold user conversations and are never cleared by code.
PROTECTED_COLLECTIONS = {CHAT_COLLECTION, BASELINE_COLLECTION}

# Backwards-compatible alias: the default (chat) collection.
COLLECTION_NAME = CHAT_COLLECTION

_active_collection: contextvars.ContextVar[str] = contextvars.ContextVar(
    "genomerag_collection", default=CHAT_COLLECTION
)

_qdrant_client = None
_ensured: set = set()
_ensure_lock = threading.Lock()
_local_memory_store: Dict[str, List[Dict[str, Any]]] = {}


def active_collection() -> str:
    """The collection the current thread/request is reading and writing."""
    return _active_collection.get()


@contextlib.contextmanager
def use_collection(name: str):
    """Route all memory operations in this context (thread/request) to `name`."""
    token = _active_collection.set(name)
    try:
        yield name
    finally:
        _active_collection.reset(token)


def qdrant_enabled() -> bool:
    return bool(os.getenv("QDRANT_URL") and os.getenv("QDRANT_API_KEY"))


def _ensure_collection(client: QdrantClient, name: str) -> None:
    if name in _ensured:
        return
    with _ensure_lock:
        if name in _ensured:
            return
        if not client.collection_exists(collection_name=name):
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
            )
        else:
            vectors = client.get_collection(name).config.params.vectors
            size = getattr(vectors, "size", None)
            if size is not None and size != EMBEDDING_DIM:
                raise RuntimeError(f"Qdrant collection {name!r} has vector size {size}, expected {EMBEDDING_DIM}.")
        _ensured.add(name)


def get_qdrant_client(collection: Optional[str] = None) -> QdrantClient:
    """Shared Qdrant client; also makes sure `collection` (default: active one) exists."""
    global _qdrant_client
    if not qdrant_enabled():
        raise RuntimeError("Qdrant credentials not found in environment; local memory fallback is active.")
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=os.getenv("QDRANT_URL"), api_key=os.getenv("QDRANT_API_KEY"))
    _ensure_collection(_qdrant_client, collection or active_collection())
    return _qdrant_client


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


def store_memory(genome: MemoryGenome, text: str, metadata: dict) -> str:
    """
    Stores a text memory in the active collection (Qdrant or local fallback).

    Args:
        genome: The MemoryGenome config.
        text: The text content of the memory.
        metadata: Associated metadata (e.g. {'type': 'episodic'|'semantic', 'step': int, ...})

    Returns:
        The ID of the inserted point.
    """
    vector = get_embedding(text)
    point_id = str(uuid.uuid4())

    if "timestamp" not in metadata:
        metadata["timestamp"] = time.time()

    payload = {"text": text, **metadata}
    collection = active_collection()

    if qdrant_enabled():
        client = get_qdrant_client(collection)
        client.upsert(
            collection_name=collection,
            points=[PointStruct(id=point_id, vector=vector, payload=payload)],
        )
    else:
        _local_memory_store.setdefault(collection, []).append(
            {"id": point_id, "vector": vector, "payload": payload}
        )
    return point_id


def retrieve_memory(genome: MemoryGenome, query: str, k: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Retrieves memories from the active collection matching the query, using genome parameters.

    Pipeline: cosine search -> drop below similarity_threshold -> re-rank by
    type weight and recency -> drop memories scoring below
    confidence_threshold x (best final score) -> keep top_k.
    """
    query_vector = get_embedding(query)

    # We fetch a larger pool than top_k to allow Python-side re-ranking
    top_k = k if k is not None else genome.retrieval_top_k
    fetch_limit = max(100, top_k * 4)

    scored_memories = []
    current_time = time.time()
    collection = active_collection()

    if qdrant_enabled():
        client = get_qdrant_client(collection)
        response = client.query_points(collection_name=collection, query=query_vector, limit=fetch_limit)
        candidates = [
            {"id": res.id, "payload": res.payload or {}, "base_score": res.score}
            for res in response.points
        ]
    else:
        candidates = [
            {"id": p["id"], "payload": p["payload"], "base_score": cosine_similarity(query_vector, p["vector"])}
            for p in _local_memory_store.get(collection, [])
        ]

    for res in candidates:
        base_score = res["base_score"]
        if base_score < genome.similarity_threshold:
            continue

        payload = res["payload"]
        mem_type = payload.get("type", "episodic")
        mem_time = payload.get("timestamp", current_time)

        if mem_type == "episodic":
            type_weight = genome.episodic_weight
        elif mem_type == "semantic":
            type_weight = genome.semantic_weight
        else:
            type_weight = 1.0

        age_hours = max(0.0, (current_time - mem_time) / 3600.0)
        decay_factor = int(round(genome.recency_bias * 10)) / 10.0
        recency_decay = math_decay(age_hours, decay_factor)
        recency_score = (1.0 - genome.recency_bias) + (genome.recency_bias * recency_decay)

        final_score = base_score * type_weight * recency_score

        scored_memories.append({
            "id": res["id"],
            "text": payload.get("text", ""),
            "metadata": payload,
            "base_score": base_score,
            "final_score": final_score,
        })

    scored_memories.sort(key=lambda x: x["final_score"], reverse=True)
    return apply_confidence_threshold(scored_memories, genome.confidence_threshold)[:top_k]


def apply_confidence_threshold(sorted_memories: List[Dict[str, Any]], threshold: float) -> List[Dict[str, Any]]:
    """Relative confidence cut-off: keep memories whose final score is at least
    `threshold` x the best memory's final score. 0 keeps everything; 1 keeps
    only memories tied with the best one. Input must be sorted best-first."""
    if not sorted_memories:
        return sorted_memories
    best = sorted_memories[0]["final_score"]
    if best <= 0:
        return sorted_memories
    return [m for m in sorted_memories if m["final_score"] >= threshold * best]


def math_decay(age_hours: float, decay_factor: float) -> float:
    """Exponential recency decay e^(-decay_factor * age_hours)."""
    return math.exp(-decay_factor * age_hours)


def count_memories(collection: Optional[str] = None) -> int:
    collection = collection or active_collection()
    if qdrant_enabled():
        return get_qdrant_client(collection).count(collection_name=collection, exact=True).count
    return len(_local_memory_store.get(collection, []))


def clear_all_memories(allow_protected: bool = False):
    """Wipe the *active* collection (benchmark/test scratch space).

    Refuses to wipe the chat collections unless `allow_protected=True`, so
    benchmark/evolution code can never erase user conversations.
    """
    collection = active_collection()
    if collection in PROTECTED_COLLECTIONS and not allow_protected:
        raise RuntimeError(
            f"Refusing to clear protected chat collection {collection!r}. "
            "Wrap the call in use_collection(BENCHMARK_COLLECTION or TEST_COLLECTION)."
        )
    if qdrant_enabled():
        client = get_qdrant_client(collection)
        client.delete_collection(collection_name=collection)
        _ensured.discard(collection)
        get_qdrant_client(collection)  # recreate empty
    else:
        _local_memory_store.pop(collection, None)
