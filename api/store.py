"""Persistence for runs, generation logs, benchmark results and chat sessions.

Two interchangeable backends with the same tiny table API:

* SupabaseBackend - the real database (tables from scripts/schema.sql).
* LocalBackend    - a JSON file (data/genomerag_local.json).

STORAGE_BACKEND selects the backend (see genome.config.storage_backend):

* local    - always the JSON file; Supabase is never contacted.
* supabase - always Supabase; failures raise PersistenceError (no silent fallback).
* auto     - (default) probe Supabase (tables exist + a real write/delete works) and
             fall back to the JSON file, re-probing at most every 60 s. /health always
             reports which backend is in use, so nothing pretends to be in Supabase.
"""
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from genome.config import get_supabase_client, storage_backend, supabase_key_kind

TABLES = ["runs", "generation_logs", "benchmark_results", "chat_sessions", "chat_messages"]
SERIAL_TABLES = {"generation_logs", "benchmark_results", "chat_messages"}
LOCAL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "genomerag_local.json")
REPROBE_SECONDS = 60


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PersistenceError(RuntimeError):
    pass


class SupabaseBackend:
    name = "supabase"

    def __init__(self, client):
        self.client = client

    def _run(self, query):
        try:
            return query.execute().data
        except Exception as e:
            raise PersistenceError(f"Supabase: {describe_supabase_error(e)}") from e

    def insert(self, table, rows):
        return self._run(self.client.table(table).insert(rows))

    def update(self, table, match, fields):
        q = self.client.table(table).update(fields)
        for k, v in match.items():
            q = q.eq(k, v)
        return self._run(q)

    def upsert(self, table, row, key):
        return self._run(self.client.table(table).upsert(row, on_conflict=key))

    def select(self, table, match=None, order=None, desc=False, limit=None, columns="*"):
        q = self.client.table(table).select(columns)
        for k, v in (match or {}).items():
            q = q.eq(k, v)
        if order:
            q = q.order(order, desc=desc)
        if limit:
            q = q.limit(limit)
        return self._run(q)

    def delete(self, table, match):
        q = self.client.table(table).delete()
        for k, v in match.items():
            q = q.eq(k, v)
        return self._run(q)


class LocalBackend:
    name = "local"

    def __init__(self, path=None):
        self.path = path or LOCAL_PATH
        self.lock = threading.RLock()
        self.data = {t: [] for t in TABLES}
        self.seq = {t: 0 for t in SERIAL_TABLES}
        # Anything in the file this version does not know about is kept and written back unchanged.
        self.extra_tables: Dict[str, Any] = {}
        self.extra: Dict[str, Any] = {}
        if os.path.exists(self.path):
            self._load()
        else:
            self._save()  # initialise an empty store in the expected format
        # Never hand out an id that already exists, even if the saved counters are missing/stale.
        for t in SERIAL_TABLES:
            ids = [r["id"] for r in self.data[t] if isinstance(r.get("id"), int)]
            self.seq[t] = max([int(self.seq.get(t) or 0)] + ids)

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                saved = json.load(f)
        except (OSError, ValueError) as e:
            raise PersistenceError(
                f"Local storage file {self.path} is empty, unreadable or not valid JSON ({type(e).__name__}: {e}). "
                "It has been left untouched; restore or move it, then restart the backend.") from e
        tables = saved.get("tables") if isinstance(saved, dict) else None
        if not isinstance(tables, dict) or not all(isinstance(tables.get(t, []), list) for t in TABLES):
            raise PersistenceError(
                f"Local storage file {self.path} does not have the expected "
                '{"tables": {...}, "seq": {...}} structure. It has been left untouched.')
        for t in TABLES:
            self.data[t] = tables.get(t, [])
        self.extra_tables = {k: v for k, v in tables.items() if k not in TABLES}
        self.extra = {k: v for k, v in saved.items() if k not in ("tables", "seq")}
        self.seq.update({k: v for k, v in (saved.get("seq") or {}).items() if isinstance(v, int)})

    def _save(self):
        """Atomic write: the full content goes to a temp file which then replaces the original."""
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        payload = {**self.extra, "tables": {**self.extra_tables, **self.data}, "seq": self.seq}
        tmp = f"{self.path}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)

    def _prepare(self, table, row):
        row = dict(row)
        if table in SERIAL_TABLES and "id" not in row:
            self.seq[table] += 1
            row["id"] = self.seq[table]
        if table == "generation_logs":
            row.setdefault("timestamp", now_iso())
        else:
            row.setdefault("created_at", now_iso())
        return row

    @staticmethod
    def _matches(row, match):
        return all(row.get(k) == v for k, v in (match or {}).items())

    def insert(self, table, rows):
        with self.lock:
            rows = [self._prepare(table, r) for r in (rows if isinstance(rows, list) else [rows])]
            self.data[table].extend(rows)
            self._save()
            return rows

    def update(self, table, match, fields):
        with self.lock:
            hit = [r for r in self.data[table] if self._matches(r, match)]
            for r in hit:
                r.update(fields)
            self._save()
            return hit

    def upsert(self, table, row, key):
        with self.lock:
            existing = [r for r in self.data[table] if r.get(key) == row[key]]
            if existing:
                existing[0].update(row)
                self._save()
                return existing
            return self.insert(table, row)

    def select(self, table, match=None, order=None, desc=False, limit=None, columns="*"):
        with self.lock:
            rows = [dict(r) for r in self.data[table] if self._matches(r, match)]
        if order:
            rows.sort(key=lambda r: (r.get(order) is None, r.get(order)), reverse=desc)
        return rows[:limit] if limit else rows

    def delete(self, table, match):
        with self.lock:
            keep = [r for r in self.data[table] if not self._matches(r, match)]
            removed = len(self.data[table]) - len(keep)
            self.data[table] = keep
            self._save()
            return removed


def describe_supabase_error(e: Exception) -> str:
    """Short, actionable description of a Supabase/PostgREST error (never includes keys)."""
    msg = str(e)
    if "PGRST205" in msg or "schema cache" in msg:
        return "tables missing - run scripts/schema.sql in the Supabase SQL Editor"
    if "42501" in msg or "row-level security" in msg or "permission denied" in msg:
        hint = " (SUPABASE_KEY is a publishable key; use the secret/service_role key)" \
            if supabase_key_kind() == "publishable" else ""
        return f"permission denied by Row Level Security{hint}"
    if "Invalid API key" in msg or "401" in msg or "JWT" in msg:
        return "invalid API key - check SUPABASE_KEY"
    if "PGRST204" in msg or "42703" in msg or "column" in msg:
        return "schema out of date - re-run scripts/schema.sql"
    return f"{type(e).__name__}: {msg[:300]}"


class Store:
    def __init__(self):
        self.mode = storage_backend()  # raises ValueError on an unsupported STORAGE_BACKEND
        self._backend = None
        self._local = None
        self._status: Dict[str, Any] = (
            {"status": "disabled", "detail": "STORAGE_BACKEND=local: Supabase is not used"}
            if self.mode == "local" else {"status": "checking", "detail": ""})
        self._checked_at = 0.0
        self._lock = threading.Lock()

    # ------------------------------------------------------------ backend choice
    def _probe_supabase(self) -> Dict[str, Any]:
        if not os.getenv("SUPABASE_URL") or not (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")):
            return {"status": "not_configured", "detail": "SUPABASE_URL / SUPABASE_KEY not set"}
        try:
            client = get_supabase_client()
            for t in TABLES:
                client.table(t).select("*").limit(1).execute()
            probe_id = f"probe-{uuid.uuid4().hex[:8]}"
            client.table("runs").insert({"run_id": probe_id, "status": "probe"}).execute()
            client.table("runs").delete().eq("run_id", probe_id).execute()
            return {"status": "ok", "detail": f"tables present, write verified ({supabase_key_kind()} key)",
                    "client": client}
        except Exception as e:
            d = describe_supabase_error(e)
            status = ("missing_tables" if "tables missing" in d else
                      "permission_denied" if "permission" in d else
                      "auth_error" if "invalid API key" in d else
                      "schema_outdated" if "out of date" in d else "error")
            return {"status": status, "detail": d}

    def _local_backend(self):
        if self._local is None:
            self._local = LocalBackend()  # raises PersistenceError if the file is corrupt (file untouched)
        return self._local

    def backend(self, force_probe: bool = False):
        with self._lock:
            if self.mode == "local":
                # Explicit local mode: no Supabase client, requests, schema checks or test writes.
                self._backend = self._local_backend()
                return self._backend

            on_supabase = self._backend is not None and self._backend.name == "supabase"
            stale = time.time() - self._checked_at > REPROBE_SECONDS
            if force_probe or (not on_supabase and (self._checked_at == 0.0 or stale)):
                result = self._probe_supabase()
                self._checked_at = time.time()
                client = result.pop("client", None)
                self._status = result
                self._backend = SupabaseBackend(client) if client is not None else None

            if self._backend is not None and self._backend.name == "supabase":
                return self._backend
            if self.mode == "supabase":
                raise PersistenceError(
                    f"Supabase unavailable (STORAGE_BACKEND=supabase): {self._status.get('detail')}")
            self._backend = self._local_backend()  # auto: fall back to the JSON file
            return self._backend

    def status(self, force_probe: bool = False) -> Dict[str, Any]:
        error = None
        try:
            name = self.backend(force_probe).name
        except PersistenceError as e:
            name, error = ("supabase" if self.mode == "supabase" else "local"), str(e)
        return {"backend": name, "mode": self.mode, "supabase": dict(self._status),
                "local_path": "data/genomerag_local.json" if name == "local" else None, "error": error}

    # ------------------------------------------------------------ runs
    def create_run(self, run: Dict[str, Any]):
        return self.backend().insert("runs", run)

    def update_run(self, run_id: str, fields: Dict[str, Any]):
        return self.backend().update("runs", {"run_id": run_id}, fields)

    def list_runs(self, limit: int = 50) -> List[Dict[str, Any]]:
        return [r for r in self.backend().select("runs", order="created_at", desc=True, limit=limit)
                if r.get("status") not in ("probe", "test")]

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        rows = self.backend().select("runs", {"run_id": run_id}, limit=1)
        return rows[0] if rows else None

    def add_generation(self, row: Dict[str, Any]):
        return self.backend().insert("generation_logs", row)

    def generations(self, run_id: str) -> List[Dict[str, Any]]:
        return self.backend().select("generation_logs", {"run_id": run_id}, order="generation_number")

    def add_benchmark(self, row: Dict[str, Any]):
        return self.backend().insert("benchmark_results", row)

    def benchmarks(self, run_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.backend().select("benchmark_results", {"run_id": run_id} if run_id else None,
                                     order="created_at", desc=True, limit=200)

    # ------------------------------------------------------------ chat
    def save_session(self, session: Dict[str, Any]):
        return self.backend().upsert("chat_sessions", {**session, "updated_at": now_iso()}, "session_id")

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        rows = self.backend().select("chat_sessions", {"session_id": session_id}, limit=1)
        return rows[0] if rows else None

    def list_sessions(self, limit: int = 30) -> List[Dict[str, Any]]:
        return self.backend().select("chat_sessions", order="updated_at", desc=True, limit=limit)

    def add_messages(self, rows: List[Dict[str, Any]]):
        return self.backend().insert("chat_messages", rows)

    def messages(self, session_id: str) -> List[Dict[str, Any]]:
        return self.backend().select("chat_messages", {"session_id": session_id}, order="id")

    def delete_session(self, session_id: str):
        b = self.backend()
        b.delete("chat_messages", {"session_id": session_id})
        return b.delete("chat_sessions", {"session_id": session_id})


store = Store()
