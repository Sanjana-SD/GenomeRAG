"""Persistence for runs, generation logs, benchmark results and chat sessions.

Two interchangeable backends with the same tiny table API:

* SupabaseBackend - the real database (tables from scripts/schema.sql).
* LocalBackend    - a JSON file (data/genomerag_local.json) used only when
  Supabase is not configured/usable. It is always reported as such in /health
  so nothing pretends to be saved in Supabase when it is not.

The backend is chosen by probing Supabase (tables exist + a real write/delete
works). While on the local fallback, Supabase is re-probed at most every 60 s.
"""
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from genome.config import get_supabase_client, supabase_key_kind

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

    def __init__(self, path=LOCAL_PATH):
        self.path = path
        self.lock = threading.RLock()
        self.data = {t: [] for t in TABLES}
        self.seq = {t: 0 for t in SERIAL_TABLES}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                saved = json.load(f)
            for t in TABLES:
                self.data[t] = saved.get("tables", {}).get(t, [])
            self.seq.update(saved.get("seq", {}))

    def _save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"tables": self.data, "seq": self.seq}, f, default=str)
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
        self._backend = None
        self._local = None
        self._status: Dict[str, Any] = {"status": "checking", "detail": ""}
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

    def backend(self, force_probe: bool = False):
        with self._lock:
            stale = time.time() - self._checked_at > REPROBE_SECONDS
            if self._backend is None or force_probe or (self._backend.name == "local" and stale):
                result = self._probe_supabase()
                self._checked_at = time.time()
                client = result.pop("client", None)
                self._status = result
                if client is not None:
                    self._backend = SupabaseBackend(client)
                else:
                    if self._local is None:
                        self._local = LocalBackend()
                    self._backend = self._local
            return self._backend

    def status(self, force_probe: bool = False) -> Dict[str, Any]:
        b = self.backend(force_probe)
        return {"backend": b.name, "supabase": dict(self._status),
                "local_path": "data/genomerag_local.json" if b.name == "local" else None}

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
