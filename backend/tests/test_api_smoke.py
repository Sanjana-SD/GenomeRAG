"""Offline smoke tests for the FastAPI app (no Groq/Qdrant/Supabase calls are made).

Run from backend/:   python -m pytest tests -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Never touch real services or the real data file from tests.
os.environ["STORAGE_BACKEND"] = "local"
os.environ["GENOMERAG_DATA_DIR"] = os.path.join(os.environ.get("TEMP", "/tmp"), "genomerag-pytest-data")
os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173,https://other.example/,*"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"  # legacy name, e.g. left over in a developer's .env
os.environ.pop("FRONTEND_ORIGIN_REGEX", None)

from fastapi.testclient import TestClient  # noqa: E402

from api.main import ALLOWED_ORIGINS, app, parse_origins  # noqa: E402

client = TestClient(app)

EXPECTED_ROUTES = {
    ("GET", "/health"), ("GET", "/healthz"), ("GET", "/api/genome/default"), ("GET", "/api/best-genome"),
    ("POST", "/api/chat"), ("GET", "/api/sessions"), ("GET", "/api/sessions/{session_id}"),
    ("DELETE", "/api/sessions/{session_id}"), ("DELETE", "/api/chat/{session_id}"), ("GET", "/api/memory/stats"),
    ("POST", "/api/memory/{agent}/clear"), ("POST", "/api/evolve"), ("GET", "/api/evolve/{run_id}"),
    ("GET", "/api/runs"), ("GET", "/api/runs/{run_id}"), ("GET", "/api/generations"), ("POST", "/api/benchmark"),
    ("GET", "/api/benchmarks"),
}


def test_all_existing_routes_registered():
    registered = {(m, r.path) for r in app.routes if hasattr(r, "methods") for m in r.methods}
    assert EXPECTED_ROUTES <= registered, EXPECTED_ROUTES - registered


def test_healthz_is_a_cheap_liveness_probe():
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_parse_origins_normalises_and_drops_wildcard():
    assert parse_origins(" https://a.example/ , ,*, http://b.example") == ["https://a.example", "http://b.example"]
    assert "*" not in ALLOWED_ORIGINS
    # explicit settings are honoured, de-duplicated, and the production frontend is always included
    assert ALLOWED_ORIGINS == ["http://localhost:5173", "https://other.example", "https://genome-rag-tcvs.vercel.app"]


@pytest.mark.parametrize("origin,allowed", [
    ("https://genome-rag-tcvs.vercel.app", True),
    ("http://localhost:5173", True),
    ("https://evil.example", False),
])
def test_cors_preflight(origin, allowed):
    r = client.options("/api/chat", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                              "Access-Control-Request-Headers": "content-type"})
    header = r.headers.get("access-control-allow-origin")
    assert (header == origin) if allowed else (header is None)
    assert "access-control-allow-credentials" not in r.headers


def test_chat_validates_input_without_calling_services():
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "hi", "agent": "nope"}).status_code == 422
    r = client.post("/api/chat", json={"message": "hi", "genome": {"not_a_gene": 1}})
    assert r.status_code == 422 and "not_a_gene" in r.json()["detail"]


def test_evolve_rejects_oversized_runs():
    assert client.post("/api/evolve", json={"pop_size": 500, "generations": 2}).status_code == 422
    assert client.post("/api/evolve", json={"pop_size": 4, "generations": 99}).status_code == 422


def test_invalid_storage_backend_is_a_clear_config_error(monkeypatch):
    from genome.config import storage_backend
    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    with pytest.raises(ValueError, match="STORAGE_BACKEND"):
        storage_backend()
