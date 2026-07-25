import os
import time
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance

from genome.genome import MemoryGenome
from genome.embeddings import get_embedding

COLLECTION_NAME = "genomerag_memories"

_qdrant_client = None

def get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        url = os.getenv("QDRANT_URL")
        api_key = os.getenv("QDRANT_API_KEY")
        if not url or not api_key:
            raise ValueError("QDRANT_URL or QDRANT_API_KEY not set in environment.")
        _qdrant_client = QdrantClient(url=url, api_key=api_key)
        
        # Ensure the collection exists
        # We use check_compatibility=False because the free tier warnings can be verbose
        try:
            exists = _qdrant_client.collection_exists(collection_name=COLLECTION_NAME)
        except Exception:
            # Fallback for older client versions
            collections = _qdrant_client.get_collections().collections
            exists = any(c.name == COLLECTION_NAME for c in collections)
            
        if not exists:
            _qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )
    return _qdrant_client

def store_memory(genome: MemoryGenome, text: str, metadata: dict) -> str:
    """
    Stores a text memory in Qdrant with its embedding vector and metadata.
    
    Args:
        genome: The MemoryGenome config.
        text: The text content of the memory.
        metadata: Associated metadata (e.g. {'type': 'episodic'|'semantic', 'step': int, ...})
        
    Returns:
        The ID of the inserted point.
    """
    client = get_qdrant_client()
    vector = get_embedding(text)
    
    import uuid
    # Generate unique ID as a UUID string
    point_id = str(uuid.uuid4())
    
    # Enforce default timestamp in metadata if not present
    if "timestamp" not in metadata:
        metadata["timestamp"] = time.time()
        
    # Include the text inside the payload
    payload = {
        "text": text,
        **metadata
    }
    
    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            PointStruct(
                id=point_id,
                vector=vector,
                payload=payload
            )
        ]
    )
    return point_id

def retrieve_memory(genome: MemoryGenome, query: str, k: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Retrieves memories from Qdrant matching the query, using the parameters from the genome.
    
    Genome-driven factors:
        - similarity_threshold: Filters out candidates below this cosine similarity.
        - retrieval_top_k: Number of memories returned (if k is not specified).
        - episodic_weight & semantic_weight: Weights applied based on memory type.
        - recency_bias: Re-ranks results to favor newer memories.
    """
    client = get_qdrant_client()
    query_vector = get_embedding(query)
    
    # We fetch a larger pool than top_k to allow Python-side re-ranking
    top_k = k if k is not None else genome.retrieval_top_k
    fetch_limit = max(100, top_k * 4)
    
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=fetch_limit
    )
    
    scored_memories = []
    current_time = time.time()
    
    for res in response.points:
        base_score = res.score  # Cosine similarity in range [0, 1]
        
        # 1. Similarity Threshold Filtering
        if base_score < genome.similarity_threshold:
            continue
            
        payload = res.payload or {}
        mem_type = payload.get("type", "episodic")
        mem_time = payload.get("timestamp", current_time)
        
        # 2. Episodic vs Semantic Weighting
        if mem_type == "episodic":
            type_weight = genome.episodic_weight
        elif mem_type == "semantic":
            type_weight = genome.semantic_weight
        else:
            type_weight = 1.0
            
        # 3. Recency Bias Re-ranking
        # Calculate time age in hours
        age_hours = max(0.0, (current_time - mem_time) / 3600.0)
        # Decay coefficient based on recency_bias: larger bias means faster decay
        # If bias is 0, decay is 0. If bias is 1, decay is exponential.
        decay_factor = int(round(genome.recency_bias * 10)) / 10.0 # clamp/clean representation
        recency_decay = math_decay(age_hours, decay_factor)
        
        # Combine parameters into a custom final score
        # final_score = base_similarity * type_weight * recency_score
        # A baseline weight of (1 - recency_bias) ensures the score doesn't drop to 0 for older items if bias is moderate.
        recency_score = (1.0 - genome.recency_bias) + (genome.recency_bias * recency_decay)
        
        final_score = base_score * type_weight * recency_score
        
        scored_memories.append({
            "id": res.id,
            "text": payload.get("text", ""),
            "metadata": payload,
            "base_score": base_score,
            "final_score": final_score
        })
        
    # Sort by final custom score descending
    scored_memories.sort(key=lambda x: x["final_score"], reverse=True)
    
    # Return top_k
    return scored_memories[:top_k]

def math_decay(age_hours: float, decay_factor: float) -> float:
    """Helper to calculate exponential decay without external math dependency imports."""
    # Simple Taylor approximation of e^(-x) or simple decay logic:
    # e^(-x) ~ 1 / (1 + x + x^2/2 + ...)
    # Let's compute e^(-x) using standard math library, or we can just import math!
    import math
    return math.exp(-decay_factor * age_hours)

def clear_all_memories():
    """Utility to clean up the collection (useful for testing)."""
    client = get_qdrant_client()
    try:
        client.delete_collection(collection_name=COLLECTION_NAME)
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE)
        )
    except Exception as e:
        print(f"Error clearing memories: {e}")
