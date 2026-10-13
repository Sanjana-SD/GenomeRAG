"""Storage backend tests (STORAGE_BACKEND local / supabase / auto).

Runs entirely on temporary files and makes no network calls; the real
data/genomerag_local.json is only ever read (copied), never written.

    python -m scripts.test_storage        (run from backend/)
"""
import hashlib
import json
import os
import shutil
import tempfile

from dotenv import load_dotenv

load_dotenv()

import api.store as store_mod
from api.store import LocalBackend, PersistenceError, Store, TABLES

REAL_FILE = store_mod.LOCAL_PATH
failures = []


def check(name, cond, detail=""):
    print(f"[{'PASS' if cond else 'FAIL'}] {name}{f' - {detail}' if detail else ''}")
    if not cond:
        failures.append(name)


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


class env:
    """Temporarily set/unset environment variables."""
    def __init__(self, **values):
        self.values, self.saved = values, {}

    def __enter__(self):
        for k, v in self.values.items():
            self.saved[k] = os.environ.get(k)
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def __exit__(self, *exc):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def forbid_supabase():
    """Make any Supabase access in this process an immediate test failure."""
    def boom(*a, **k):
        raise AssertionError("Supabase was contacted in local mode")
    store_mod.get_supabase_client = boom
    store_mod.supabase_key_kind = boom


def main():
    tmp = tempfile.mkdtemp(prefix="genomerag-storage-test-")
    original_get_client, original_key_kind = store_mod.get_supabase_client, store_mod.supabase_key_kind
    try:
        # 1. Missing file -> initialised in the expected format
        path = os.path.join(tmp, "new", "store.json")
        LocalBackend(path)
        with open(path, encoding="utf-8") as f:
            saved = json.load(f)
        check("missing file is initialised with {tables, seq}",
              set(saved) == {"tables", "seq"} and all(saved["tables"][t] == [] for t in TABLES))

        # 2. Empty / invalid / wrong-shape files are reported and left byte-for-byte untouched
        for label, content in [("empty", ""), ("invalid JSON", "{not json"), ("wrong structure", '{"tables": []}')]:
            bad = os.path.join(tmp, f"bad-{label.replace(' ', '_')}.json")
            with open(bad, "w", encoding="utf-8") as f:
                f.write(content)
            before = sha(bad)
            try:
                LocalBackend(bad)
                check(f"{label} file raises PersistenceError", False)
            except PersistenceError as e:
                check(f"{label} file raises PersistenceError", "left untouched" in str(e))
            check(f"{label} file not modified", sha(bad) == before)

        # 3. Unknown keys/tables preserved; ids never collide even without saved counters
        legacy = os.path.join(tmp, "legacy.json")
        with open(legacy, "w", encoding="utf-8") as f:
            json.dump({"tables": {"runs": [{"run_id": "r1", "status": "done"}],
                                  "generation_logs": [{"id": 7, "run_id": "r1", "generation_number": 0,
                                                       "best_fitness": 0.5, "avg_fitness": 0.4}],
                                  "my_extra_table": [{"x": 1}]},
                       "notes": "keep me"}, f)
        b = LocalBackend(legacy)
        b.insert("generation_logs", {"run_id": "r1", "generation_number": 1, "best_fitness": 0.6, "avg_fitness": 0.5})
        with open(legacy, encoding="utf-8") as f:
            saved = json.load(f)
        check("unknown top-level key preserved", saved.get("notes") == "keep me")
        check("unknown table preserved", saved["tables"].get("my_extra_table") == [{"x": 1}])
        check("new id continues after existing ids", [r["id"] for r in saved["tables"]["generation_logs"]] == [7, 8])
        check("no temp file left behind", not [n for n in os.listdir(tmp) if n.endswith(".tmp")])

        # 4. Real data file: loads with the same records, and a write keeps every existing record
        if os.path.exists(REAL_FILE):
            real_before = sha(REAL_FILE)
            copy = os.path.join(tmp, "real-copy.json")
            shutil.copyfile(REAL_FILE, copy)
            with open(copy, encoding="utf-8") as f:
                original = json.load(f)
            b = LocalBackend(copy)
            check("real data file loads", all(b.data[t] == original["tables"].get(t, []) for t in TABLES),
                  ", ".join(f"{len(b.data[t])} {t}" for t in TABLES))
            b.insert("runs", {"run_id": "test-run", "status": "done"})
            with open(copy, encoding="utf-8") as f:
                after = json.load(f)
            kept = all(r in after["tables"][t] for t in TABLES for r in original["tables"].get(t, []))
            check("existing records survive a new write", kept and len(after["tables"]["runs"]) == len(original["tables"]["runs"]) + 1)
            check("real data file was not modified by this test", sha(REAL_FILE) == real_before)
        else:
            print("[SKIP] no real data file to check")

        # 5. STORAGE_BACKEND=local: full round trip, restart, and zero Supabase access
        store_mod.LOCAL_PATH = os.path.join(tmp, "local-mode.json")
        forbid_supabase()
        with env(STORAGE_BACKEND="local", SUPABASE_URL=None, SUPABASE_KEY=None, SUPABASE_SERVICE_ROLE_KEY=None):
            s = Store()
            st = s.status(force_probe=True)
            check("local mode selects local backend", st["backend"] == "local" and st["mode"] == "local")
            check("local mode reports Supabase as disabled", st["supabase"]["status"] == "disabled" and st["error"] is None)
            s.create_run({"run_id": "run-a", "status": "running", "pop_size": 2, "generations": 1})
            s.add_generation({"run_id": "run-a", "generation_number": 0, "best_fitness": 0.7, "avg_fitness": 0.5,
                              "best_genome_json": {"retrieval_top_k": 5}})
            s.update_run("run-a", {"status": "done", "best_fitness": 0.7})
            s.add_benchmark({"run_id": "run-a", "agent": "evolved", "genome": {}, "accuracy": 0.8,
                             "tasks": [{"id": 1, "response": "Rex"}]})
            s.save_session({"session_id": "sess-1", "agent": "evolved", "step": 1})
            s.add_messages([{"session_id": "sess-1", "role": "user", "content": "hi"},
                            {"session_id": "sess-1", "role": "assistant", "content": "hello", "meta": {"timings": {}}}])
            s2 = Store()  # simulated backend restart
            check("run persisted across restart", s2.get_run("run-a")["status"] == "done")
            check("generation log persisted", len(s2.generations("run-a")) == 1)
            check("benchmark (with task records) persisted", s2.benchmarks("run-a")[0]["tasks"][0]["response"] == "Rex")
            check("chat session and messages persisted",
                  s2.get_session("sess-1") is not None and [m["content"] for m in s2.messages("sess-1")] == ["hi", "hello"])

        # 6. Invalid STORAGE_BACKEND is a clear configuration error
        with env(STORAGE_BACKEND="postgres"):
            try:
                Store()
                check("invalid STORAGE_BACKEND rejected", False)
            except ValueError as e:
                check("invalid STORAGE_BACKEND rejected", "STORAGE_BACKEND" in str(e), str(e))

        # 7. supabase / auto without credentials (no network: the probe stops at the missing config)
        store_mod.get_supabase_client, store_mod.supabase_key_kind = original_get_client, original_key_kind
        with env(STORAGE_BACKEND="supabase", SUPABASE_URL=None, SUPABASE_KEY=None, SUPABASE_SERVICE_ROLE_KEY=None):
            s = Store()
            try:
                s.list_runs()
                check("supabase mode does not silently fall back", False)
            except PersistenceError as e:
                check("supabase mode does not silently fall back", "STORAGE_BACKEND=supabase" in str(e))
            check("supabase mode status reports the error", s.status()["error"] is not None)
        with env(STORAGE_BACKEND=None, SUPABASE_URL=None, SUPABASE_KEY=None, SUPABASE_SERVICE_ROLE_KEY=None):
            st = Store().status()
            check("unset STORAGE_BACKEND keeps the old auto fallback",
                  st["mode"] == "auto" and st["backend"] == "local" and st["supabase"]["status"] == "not_configured")
    finally:
        store_mod.LOCAL_PATH = REAL_FILE
        store_mod.get_supabase_client, store_mod.supabase_key_kind = original_get_client, original_key_kind
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    print(f"{len(failures)} failure(s): {failures}" if failures else "All storage tests passed.")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
