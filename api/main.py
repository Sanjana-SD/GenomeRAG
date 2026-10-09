"""GenomeRAG FastAPI backend.

Run from the repo root:
    python -m uvicorn api.main:app --reload --port 8000
"""
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from api.store import PersistenceError, now_iso, store
from genome.config import groq_model, supabase_key_kind
from genome.genome import BASELINE_GENOME, GENE_INFO, MemoryGenome
from genome.vector_store import (
    BASELINE_COLLECTION, BENCHMARK_COLLECTION, CHAT_COLLECTION, clear_all_memories, count_memories,
    get_qdrant_client, qdrant_enabled, use_collection,
)

log = logging.getLogger("genomerag")

app = FastAPI(title="GenomeRAG API", version="2.0.0")

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Live-demo limits: every genome evaluation costs one LLM call per benchmark task.
MAX_POP, MAX_GENS = 12, 6
AGENT_COLLECTIONS = {"evolved": CHAT_COLLECTION, "baseline": BASELINE_COLLECTION}

_agent_app = None
_sessions: Dict[str, Dict[str, Any]] = {}       # in-memory cache of chat sessions
_session_locks: Dict[str, threading.Lock] = {}
_active: Dict[str, Any] = {}                    # the single running evolution/benchmark job
_finished: Dict[str, Dict[str, Any]] = {}     # final in-memory copy of jobs finished in this process
_job_lock = threading.Lock()
_health_cache: Dict[str, Any] = {}


def _agent():
    """Lazy import: loading the embedding model/LangGraph is slow."""
    global _agent_app
    if _agent_app is None:
        from agent.graph import agent_app
        _agent_app = agent_app
    return _agent_app


def _num_tasks() -> int:
    from evolution.benchmark import BENCHMARK_TASKS
    return len(BENCHMARK_TASKS)


@app.on_event("startup")
def _startup():
    missing = [v for v in ("GROQ_API_KEY", "QDRANT_URL", "QDRANT_API_KEY", "SUPABASE_URL") if not os.getenv(v)]
    if missing:
        log.warning("Missing configuration: %s (see .env.example)", ", ".join(missing))
    # Runs left 'running' by a previous process can never finish: mark them interrupted.
    try:
        for r in store.list_runs(limit=200):
            if r.get("status") == "running":
                store.update_run(r["run_id"], {"status": "interrupted", "phase": None,
                                               "error": "Backend restarted while the run was in progress.",
                                               "finished_at": now_iso()})
    except Exception as e:
        log.warning("Could not reconcile interrupted runs: %s", e)


# ======================================================================= health
def _check_groq() -> Dict[str, Any]:
    if not os.getenv("GROQ_API_KEY"):
        return {"status": "not_configured", "detail": "GROQ_API_KEY not set"}
    cached = _health_cache.get("groq")
    if cached and time.time() - cached[0] < 60:
        return cached[1]
    try:
        from groq import Groq
        ids = {m.id for m in Groq(max_retries=0, timeout=10).models.list().data}
        model = groq_model()
        res = ({"status": "ok", "detail": f"model {model} available"} if model in ids else
               {"status": "error", "detail": f"GROQ_MODEL '{model}' is not available to this key"})
    except Exception as e:
        status = "auth_error" if "401" in str(e) or "invalid_api_key" in str(e) else "error"
        res = {"status": status, "detail": f"{type(e).__name__}: {str(e)[:200]}"}
    _health_cache["groq"] = (time.time(), res)
    return res


def _check_qdrant() -> Dict[str, Any]:
    if not qdrant_enabled():
        return {"status": "not_configured", "detail": "QDRANT_URL / QDRANT_API_KEY not set (in-process memory fallback)"}
    try:
        get_qdrant_client(CHAT_COLLECTION).get_collections()
        return {"status": "ok", "detail": "connected"}
    except Exception as e:
        status = "auth_error" if "403" in str(e) or "401" in str(e) else "error"
        return {"status": status, "detail": f"{type(e).__name__}: {str(e)[:200]}"}


@app.get("/health")
def health(refresh: bool = False):
    persistence = store.status(force_probe=refresh)
    return {
        "status": "ok",
        "services": {
            "groq": {**_check_groq(), "model": groq_model()},
            "qdrant": _check_qdrant(),
            "supabase": {**persistence["supabase"], "key_kind": supabase_key_kind()},
        },
        "persistence": {"backend": persistence["backend"], "local_path": persistence["local_path"]},
        "memory_backend": "qdrant" if qdrant_enabled() else "local-fallback",
        "active_job": _public_job(),
        "limits": {"max_pop_size": MAX_POP, "max_generations": MAX_GENS, "benchmark_tasks": _num_tasks()},
    }


# ======================================================================= genome
@app.get("/api/genome/default")
def default_genome():
    from evolution.ga import GENE_BOUNDS
    d = MemoryGenome().to_dict()
    bounds = dict(zip(d.keys(), GENE_BOUNDS))
    return {
        "genome": d,
        "baseline": BASELINE_GENOME.to_dict(),
        "bounds": bounds,
        "params": [
            {"name": k, "unit": GENE_INFO[k][0], "description": GENE_INFO[k][1], "min": bounds[k][0],
             "max": bounds[k][1], "integer": isinstance(d[k], int)}
            for k in d
        ],
    }


@app.get("/api/best-genome")
def best_genome():
    """Best genome across completed runs (highest best_fitness)."""
    try:
        runs = [r for r in store.list_runs(200) if r.get("status") == "done" and r.get("best_genome")]
    except PersistenceError as e:
        raise HTTPException(503, str(e))
    if not runs:
        raise HTTPException(404, "No completed evolution run yet.")
    best = max(runs, key=lambda r: r.get("best_fitness") or float("-inf"))
    return {"run_id": best["run_id"], "fitness": best.get("best_fitness"), "genome": best["best_genome"]}


# ======================================================================= chat
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = Field(None, max_length=64)
    agent: Literal["evolved", "baseline"] = "evolved"
    genome: Optional[Dict[str, float]] = None
    genome_source: Optional[str] = Field(None, max_length=80)


def _load_session(sid: str) -> Optional[Dict[str, Any]]:
    if sid in _sessions:
        return _sessions[sid]
    try:
        row = store.get_session(sid)
        if not row:
            return None
        msgs = store.messages(sid)
    except PersistenceError:
        return None
    sess = {"agent": row.get("agent", "evolved"), "step": row.get("step") or 0,
            "created_at": row.get("created_at"),
            "messages": [{"role": m["role"], "content": m["content"]} for m in msgs]}
    _sessions[sid] = sess
    return sess


@app.post("/api/chat")
def chat(req: ChatRequest):
    sid = req.session_id or str(uuid.uuid4())
    lock = _session_locks.setdefault(sid, threading.Lock())
    with lock:
        sess = _load_session(sid)
        new = sess is None
        if new:
            sess = {"agent": req.agent, "step": 0, "messages": [], "created_at": now_iso()}
        elif sess["agent"] != req.agent:
            raise HTTPException(409, f"Session belongs to the {sess['agent']} agent.")

        if req.agent == "baseline":
            genome, source = BASELINE_GENOME, "baseline (fixed)"
        else:
            unknown = set(req.genome or {}) - set(MemoryGenome().to_dict())
            if unknown:
                raise HTTPException(422, f"Unknown genome parameter(s): {', '.join(sorted(unknown))}")
            try:
                genome = MemoryGenome.from_dict(req.genome) if req.genome else MemoryGenome()
            except (TypeError, ValueError) as e:
                raise HTTPException(422, f"Invalid genome: {e}")
            source = req.genome_source or ("custom" if req.genome else "default")
        collection = AGENT_COLLECTIONS[req.agent]

        state = {"messages": list(sess["messages"]), "current_input": req.message, "retrieved_memories": [],
                 "response": "", "step": sess["step"], "genome": genome, "agent_logs": [], "timings": {}}
        t0 = time.perf_counter()
        try:
            with use_collection(collection):
                out = _agent().invoke(state)
        except Exception as e:
            raise HTTPException(502, f"Agent error: {type(e).__name__}: {e}")
        total_ms = (time.perf_counter() - t0) * 1000
        if out.get("error"):
            raise HTTPException(502, f"LLM call failed: {out['error']}")

        timings = {**out.get("timings", {}), "total_ms": total_ms}
        memories = [{"text": m["text"], "type": m["metadata"].get("type"), "score": round(m["final_score"], 4),
                     "similarity": round(m["base_score"], 4)} for m in out.get("retrieved_memories", [])]
        meta = {"timings": timings, "memories": memories, "logs": out["agent_logs"]}

        sess["messages"] += [{"role": "user", "content": req.message},
                             {"role": "assistant", "content": out["response"]}]
        sess["step"] = out["step"]
        _sessions[sid] = sess

        persisted, persist_error = True, None
        try:
            store.save_session({"session_id": sid, "agent": req.agent, "genome": genome.to_dict(),
                                "genome_source": source, "step": sess["step"],
                                **({"created_at": sess["created_at"]} if new else {})})
            store.add_messages([
                {"session_id": sid, "role": "user", "content": req.message},
                {"session_id": sid, "role": "assistant", "content": out["response"], "meta": meta},
            ])
        except PersistenceError as e:
            persisted, persist_error = False, str(e)

    return {
        "session_id": sid,
        "agent": req.agent,
        "collection": collection,
        "response": out["response"],
        "step": out["step"],
        "retrieved_memories": memories,
        "logs": out["agent_logs"],
        "timings": timings,
        "genome": genome.to_dict(),
        "genome_source": source,
        "persisted": persisted,
        "persistence_backend": store.status()["backend"],
        "persist_error": persist_error,
    }


@app.get("/api/sessions")
def list_sessions(agent: Optional[str] = None):
    try:
        rows = store.list_sessions()
    except PersistenceError as e:
        raise HTTPException(503, str(e))
    return {"sessions": [r for r in rows if not agent or r.get("agent") == agent]}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    try:
        row = store.get_session(session_id)
        msgs = store.messages(session_id) if row else []
    except PersistenceError as e:
        raise HTTPException(503, str(e))
    if not row:
        raise HTTPException(404, "Unknown session")
    return {"session": row, "messages": msgs}


@app.delete("/api/sessions/{session_id}")
@app.delete("/api/chat/{session_id}")
def reset_session(session_id: str):
    """Forget a conversation's history. Long-term memories in Qdrant are kept."""
    _sessions.pop(session_id, None)
    try:
        store.delete_session(session_id)
    except PersistenceError as e:
        raise HTTPException(503, str(e))
    return {"status": "reset"}


# ======================================================================= memory
@app.get("/api/memory/stats")
def memory_stats():
    out = {}
    for name, coll in {**AGENT_COLLECTIONS, "benchmark": BENCHMARK_COLLECTION}.items():
        try:
            out[name] = {"collection": coll, "count": count_memories(coll)}
        except Exception as e:
            out[name] = {"collection": coll, "count": None, "error": f"{type(e).__name__}: {e}"}
    return out


@app.post("/api/memory/{agent}/clear")
def clear_agent_memory(agent: Literal["evolved", "baseline"], confirm: bool = False):
    """Deliberately wipe one chat agent's long-term memory (explicit confirmation required)."""
    if not confirm:
        raise HTTPException(400, "Pass ?confirm=true to wipe this agent's long-term memory.")
    with use_collection(AGENT_COLLECTIONS[agent]):
        clear_all_memories(allow_protected=True)
    return {"status": "cleared", "agent": agent}


# ======================================================================= evolution
class EvolveRequest(BaseModel):
    pop_size: int = Field(4, ge=2, le=MAX_POP)
    generations: int = Field(2, ge=1, le=MAX_GENS)
    benchmark: bool = True


def _public_job() -> Optional[Dict[str, Any]]:
    if not _active:
        return None
    return {k: v for k, v in _active.items() if k not in ("generation_logs",)}


def _persist(job: Dict[str, Any], fn, *args):
    """Write to the store; record (never hide) failures on the live job."""
    try:
        fn(*args)
    except PersistenceError as e:
        job.setdefault("persist_errors", [])
        if str(e) not in job["persist_errors"]:
            job["persist_errors"].append(str(e))


def _benchmark_row(run_id, agent, genome: MemoryGenome, result):
    return {"run_id": run_id, "agent": agent, "genome": genome.to_dict(), "accuracy": result["accuracy"],
            "avg_latency": result["avg_latency"], "avg_retrieval_ms": result["avg_retrieval_ms"],
            "avg_llm_ms": result["avg_llm_ms"], "fitness": result["fitness"], "num_tasks": len(result["tasks"]),
            "errors": result["errors"], "tasks": result["tasks"], "model": groq_model()}


def _run_benchmarks(job: Dict[str, Any], best: MemoryGenome):
    from evolution.benchmark import run_benchmark
    run_id = job["run_id"]
    job.update(phase="benchmark: evolved", benchmark_status="running")
    _persist(job, store.update_run, run_id, {"phase": job["phase"], "benchmark_status": "running"})
    evolved = run_benchmark(best)
    _persist(job, store.add_benchmark, _benchmark_row(run_id, "evolved", best, evolved))
    job.update(phase="benchmark: baseline")
    _persist(job, store.update_run, run_id, {"phase": job["phase"]})
    baseline = run_benchmark(BASELINE_GENOME)
    _persist(job, store.add_benchmark, _benchmark_row(run_id, "baseline", BASELINE_GENOME, baseline))
    job["benchmark_status"] = "done"


def _run_evolution(job: Dict[str, Any], req: EvolveRequest):
    from deap import tools
    from evolution.benchmark import evaluate_genome_fitness
    from evolution.ga import run_evolution_loop, setup_toolbox

    run_id = job["run_id"]
    n_tasks = _num_tasks()

    def evaluate(ind):
        genome = MemoryGenome.from_list(ind)
        details: Dict[str, Any] = {}
        fit = evaluate_genome_fitness(genome, details=details)
        ind.accuracy, ind.latency, ind.task_errors = details["accuracy"], details["avg_latency"], details["errors"]
        job["evaluations"] += 1
        _persist(job, store.update_run, run_id, {"evaluations": job["evaluations"]})
        if details["errors"] == n_tasks:
            first = next(t["error"] for t in details["tasks"] if t["error"])
            raise RuntimeError(f"Every benchmark task failed for a genome (last error: {first})")
        return fit

    def on_generation(gen, pop):
        fits = [ind.fitness.values[0] for ind in pop]
        best = tools.selBest(pop, 1)[0]
        lats = [getattr(i, "latency", None) for i in pop if getattr(i, "latency", None) is not None]
        row = {
            "run_id": run_id, "generation_number": gen, "best_fitness": max(fits),
            "avg_fitness": sum(fits) / len(fits), "worst_fitness": min(fits),
            "best_genome_json": MemoryGenome.from_list(best).to_dict(),
            "best_accuracy": getattr(best, "accuracy", None), "best_latency": getattr(best, "latency", None),
            "avg_latency": sum(lats) / len(lats) if lats else None, "evaluations": job["evaluations"],
            "task_errors": sum(getattr(i, "task_errors", 0) for i in pop),
        }
        job["generation_logs"].append({**row, "timestamp": now_iso()})
        if job["best_fitness"] is None or row["best_fitness"] > job["best_fitness"]:
            job["best_fitness"], job["best_genome"] = row["best_fitness"], row["best_genome_json"]
        job["current_generation"] = gen
        job["phase"] = f"generation {gen + 1}" if gen < req.generations else "finalising"
        _persist(job, store.add_generation, row)
        _persist(job, store.update_run, run_id, {
            "current_generation": gen, "best_fitness": job["best_fitness"], "best_genome": job["best_genome"],
            "phase": job["phase"]})

    try:
        run_evolution_loop(setup_toolbox(evaluate), pop_size=req.pop_size, generations=req.generations,
                           verbose=False, on_generation=on_generation)
        if req.benchmark:
            _run_benchmarks(job, MemoryGenome.from_dict(job["best_genome"]))
        job.update(status="done", phase=None)
    except Exception as e:
        log.exception("Evolution run %s failed", run_id)
        job.update(status="error", phase=None, error=f"{type(e).__name__}: {e}")
        if job.get("benchmark_status") == "running":
            job["benchmark_status"] = "error"
    finally:
        job["finished_at"] = now_iso()
        _persist(job, store.update_run, run_id, {
            k: job.get(k) for k in ("status", "phase", "error", "finished_at", "benchmark_status",
                                    "best_fitness", "best_genome", "current_generation", "evaluations")})
        with _job_lock:
            _finished[run_id] = {**job, "generation_logs": list(job["generation_logs"])}
            _active.clear()


@app.post("/api/evolve", status_code=202)
def evolve(req: EvolveRequest):
    """Start a real GA run in a background thread (chat memory is never touched)."""
    with _job_lock:
        if _active:
            raise HTTPException(409, f"Job {_active['run_id']} is already running.")
        run_id = f"run-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:4]}"
        job = {"run_id": run_id, "kind": "evolution", "status": "running", "phase": "generation 0 (initial population)",
               "pop_size": req.pop_size, "generations": req.generations, "current_generation": None,
               "evaluations": 0, "best_fitness": None, "best_genome": None, "model": groq_model(),
               "benchmark_status": "pending" if req.benchmark else "skipped", "started_at": now_iso(),
               "created_at": now_iso(), "error": None, "generation_logs": []}
        _active.update(job)
    _persist(_active, store.create_run, {k: _active[k] for k in (
        "run_id", "status", "phase", "pop_size", "generations", "evaluations", "model", "benchmark_status",
        "started_at")})
    threading.Thread(target=_run_evolution, args=(_active, req), daemon=True).start()
    return _public_job()


class BenchmarkRequest(BaseModel):
    run_id: str


@app.post("/api/benchmark", status_code=202)
def benchmark(req: BenchmarkRequest):
    """Re-run the benchmark for a completed run's best genome and the baseline."""
    run = _run_detail(req.run_id)["run"]
    if not run.get("best_genome"):
        raise HTTPException(400, "This run has no best genome to benchmark.")
    with _job_lock:
        if _active:
            raise HTTPException(409, f"Job {_active['run_id']} is already running.")
        _active.update({"run_id": req.run_id, "kind": "benchmark", "status": "running", "phase": "benchmark",
                        "started_at": now_iso(), "error": None, "benchmark_status": "running"})

    def work(job):
        try:
            _run_benchmarks(job, MemoryGenome.from_dict(run["best_genome"]))
        except Exception as e:
            job.update(benchmark_status="error", error=f"{type(e).__name__}: {e}")
        finally:
            _persist(job, store.update_run, req.run_id, {"benchmark_status": job["benchmark_status"], "phase": None})
            with _job_lock:
                _active.clear()

    threading.Thread(target=work, args=(_active,), daemon=True).start()
    return _public_job()


def _run_detail(run_id: str) -> Dict[str, Any]:
    live = (_active if _active.get("run_id") == run_id and _active.get("kind") == "evolution"
            else _finished.get(run_id))
    try:
        run = store.get_run(run_id)
        gens = store.generations(run_id)
        benches = store.benchmarks(run_id)
    except PersistenceError as e:
        if not live:
            raise HTTPException(503, str(e))
        run, gens, benches = None, [], []
    if live:
        run = {**(run or {}), **{k: v for k, v in live.items() if k != "generation_logs"}}
        gens = gens if len(gens) >= len(live["generation_logs"]) else live["generation_logs"]
    if not run:
        raise HTTPException(404, "Unknown run")
    return {"run": run, "generations": gens, "benchmarks": benches,
            "active": bool(_active.get("run_id") == run_id)}


@app.get("/api/evolve/{run_id}")
@app.get("/api/runs/{run_id}")
def run_detail(run_id: str):
    return _run_detail(run_id)


@app.get("/api/generations")
def generations(run_id: str = Query(...)):
    return {"run_id": run_id, "generations": _run_detail(run_id)["generations"]}


@app.get("/api/runs")
def list_runs():
    try:
        runs = store.list_runs()
        error = None
    except PersistenceError as e:
        runs, error = [], str(e)
    if _active.get("kind") == "evolution":
        runs = [{**r, **_public_job()} if r["run_id"] == _active["run_id"] else r for r in runs]
        if not any(r["run_id"] == _active["run_id"] for r in runs):
            runs.insert(0, _public_job())
    if error and not runs:
        raise HTTPException(503, error)
    return {"runs": runs, "persistence_backend": store.status()["backend"]}


@app.get("/api/benchmarks")
def list_benchmarks():
    """All benchmark executions (without per-task detail) for trend charts."""
    try:
        rows = store.benchmarks()
    except PersistenceError as e:
        raise HTTPException(503, str(e))
    return {"benchmarks": [{k: v for k, v in r.items() if k != "tasks"} for r in rows]}


# ======================================================================= static frontend
_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
