"""GenomeRAG setup verification.

Usage (from the repo root):
    .\\.venv\\Scripts\\python.exe scripts\\verify_setup.py            # all checks
    .\\.venv\\Scripts\\python.exe scripts\\verify_setup.py qdrant groq  # only selected checks

Checks use the same configuration/code paths as the application (genome.config,
genome.vector_store). Secrets are never printed.
"""
import importlib
import os
import sys
import traceback
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

REQUIRED_PACKAGES = [  # import names
    "dotenv", "langgraph", "langchain_core", "deap", "torch", "sentence_transformers",
    "qdrant_client", "fastapi", "uvicorn", "groq", "supabase",
]
REQUIRED_ENV = ["QDRANT_URL", "QDRANT_API_KEY", "GROQ_API_KEY", "SUPABASE_URL"]
PLACEHOLDER_MARKERS = ("your_", "your-", ".example")
SCHEMA = {
    "runs": ["run_id", "created_at", "status", "best_fitness", "best_genome", "pop_size", "generations",
             "current_generation", "evaluations", "phase", "model", "error", "benchmark_status",
             "started_at", "finished_at"],
    "generation_logs": ["id", "run_id", "generation_number", "best_fitness", "avg_fitness", "best_genome_json",
                        "timestamp", "worst_fitness", "best_accuracy", "best_latency", "avg_latency",
                        "evaluations", "task_errors"],
    "benchmark_results": ["id", "run_id", "agent", "genome", "accuracy", "avg_latency", "avg_retrieval_ms",
                          "avg_llm_ms", "fitness", "num_tasks", "errors", "tasks", "model", "created_at"],
    "chat_sessions": ["session_id", "agent", "genome", "genome_source", "step", "created_at", "updated_at"],
    "chat_messages": ["id", "session_id", "role", "content", "meta", "created_at"],
}


def _err(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"


def check_python():
    venv = os.path.normcase(os.path.join(ROOT, ".venv"))
    in_venv = os.path.normcase(sys.prefix).startswith(venv)
    if sys.version_info < (3, 10):
        return False, f"Python {sys.version.split()[0]} is too old (need 3.10+)."
    if not in_venv:
        return False, (f"Running {sys.executable}, not the project .venv. "
                       r"Use .\.venv\Scripts\python.exe scripts\verify_setup.py")
    return True, f"Python {sys.version.split()[0]} ({sys.executable})"


def check_dependencies():
    missing = []
    for pkg in REQUIRED_PACKAGES:
        try:
            importlib.import_module(pkg)
        except Exception as e:
            missing.append(f"{pkg} ({_err(e)})")
    if missing:
        return False, "Import failed: " + "; ".join(missing) + " -> run: pip install -r requirements.txt"
    from importlib.metadata import version
    return True, ", ".join(f"{p}=={version(p)}" for p in ("qdrant-client", "groq", "supabase", "langgraph"))


def check_config():
    import genome.config as config
    problems = []
    for var in REQUIRED_ENV:
        val = os.getenv(var, "")
        if not val:
            problems.append(f"{var} is empty")
        elif any(m in val for m in PLACEHOLDER_MARKERS):
            problems.append(f"{var} still has the placeholder value")
    if not (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")):
        problems.append("SUPABASE_KEY is empty")
    if config.supabase_key_kind() in ("publishable", "anon"):
        problems.append("SUPABASE_KEY is a publishable/anon key; the backend needs the secret (service_role) key")
    if problems:
        return False, "; ".join(problems) + " (edit .env)"
    return True, f"All required variables set; GROQ_MODEL={config.groq_model()}"


def check_qdrant():
    from qdrant_client import QdrantClient
    url, key = os.getenv("QDRANT_URL"), os.getenv("QDRANT_API_KEY")
    if not url or not key:
        return False, "QDRANT_URL or QDRANT_API_KEY is not set in .env"
    client = QdrantClient(url=url, api_key=key)
    n = len(client.get_collections().collections)
    return True, f"Connected to {url.split('//')[-1].split('.')[0]}... ({n} collection(s))"


def check_qdrant_collection():
    from genome.vector_store import (get_qdrant_client, CHAT_COLLECTION, BASELINE_COLLECTION,
                                     BENCHMARK_COLLECTION)
    from genome.embeddings import EMBEDDING_DIM
    parts = []
    for name in (CHAT_COLLECTION, BASELINE_COLLECTION, BENCHMARK_COLLECTION):
        info = get_qdrant_client(name).get_collection(name)  # creates it if missing
        vec = info.config.params.vectors
        if vec.size != EMBEDDING_DIM:
            return False, f"'{name}' has vector size {vec.size}, expected {EMBEDDING_DIM}"
        parts.append(f"{name} ({info.points_count} pts)")
    return True, f"size={EMBEDDING_DIM}, cosine: " + ", ".join(parts)


def check_groq():
    from groq import Groq
    from genome.config import groq_model, groq_chat
    if not os.getenv("GROQ_API_KEY"):
        return False, "GROQ_API_KEY is not set in .env"
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    model = groq_model()
    available = {m.id for m in client.models.list().data}
    if model not in available:
        chat_models = sorted(m for m in available if "whisper" not in m and "guard" not in m and "orpheus" not in m)
        return False, f"GROQ_MODEL '{model}' is not available. Available chat models: {', '.join(chat_models)}"
    reply = groq_chat(client, [{"role": "user", "content": "Reply with the single word: pong"}], max_tokens=10)
    if not reply:
        return False, f"Model '{model}' returned an empty response."
    return True, f"Model '{model}' replied: {reply!r}"


def check_supabase():
    from genome.config import get_supabase_client
    client = get_supabase_client()
    run_id = f"verify-{uuid.uuid4().hex[:8]}"
    client.table("runs").insert({"run_id": run_id, "status": "test"}).execute()
    try:
        rows = client.table("runs").select("*").eq("run_id", run_id).execute().data
        if not rows:
            return False, "Inserted a row into 'runs' but could not read it back (check RLS policies)."
    finally:
        client.table("runs").delete().eq("run_id", run_id).execute()
    left = client.table("runs").select("run_id").eq("run_id", run_id).execute().data
    if left:
        return False, "Write/read OK but delete did not remove the test row (check RLS policies)."
    return True, "Write, read and delete verified on 'runs'."


def check_schema():
    from genome.config import get_supabase_client
    client = get_supabase_client()
    for table, cols in SCHEMA.items():
        client.table(table).select(",".join(cols)).limit(1).execute()
    return True, "Tables " + ", ".join(SCHEMA) + " exist with the expected columns."


CHECKS = [
    ("python", "Python environment", check_python),
    ("deps", "Dependencies", check_dependencies),
    ("config", "Configuration", check_config),
    ("qdrant", "Qdrant Cloud", check_qdrant),
    ("collection", "Qdrant collection", check_qdrant_collection),
    ("groq", "Groq LLM", check_groq),
    ("supabase", "Supabase DB", check_supabase),
    ("schema", "Database schema", check_schema),
]

HINTS = {
    "PGRST205": "Table missing: open Supabase -> SQL Editor, paste scripts/schema.sql and run it.",
    "PGRST204": "Column missing: re-run scripts/schema.sql in the Supabase SQL Editor.",
    "42703": "Column missing: re-run scripts/schema.sql in the Supabase SQL Editor.",
    "Invalid API key": "SUPABASE_KEY is wrong: copy it from Supabase -> Project Settings -> API Keys.",
    "42501": "Row Level Security blocked the write: use the secret (service_role) key, not the publishable key.",
    "row-level security": "Row Level Security blocked the write: use the secret (service_role) key, not the publishable key.",
    "Unauthorized": "API key rejected: check the key in .env.",
    "403": "API key rejected/forbidden: check the key in .env.",
}


def main():
    selected = set(a.lower() for a in sys.argv[1:])
    print("GenomeRAG Setup Verification")
    print("============================")
    failed = 0
    for key, name, fn in CHECKS:
        if selected and key not in selected:
            continue
        try:
            ok, msg = fn()
        except Exception as e:
            ok, msg = False, _err(e)
            hint = next((h for k, h in HINTS.items() if k in msg), None)
            if hint:
                msg += f"\n       Hint: {hint}"
            if os.getenv("VERIFY_DEBUG"):
                traceback.print_exc()
        print(f"[{'OK' if ok else 'FAIL'}] {name}: {msg}")
        failed += not ok
    print()
    if failed:
        print(f"{failed} check(s) failed. Set VERIFY_DEBUG=1 for full tracebacks.")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
