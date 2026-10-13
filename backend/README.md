# GenomeRAG backend

FastAPI service. Entry point: `api.main:app`. Run everything from this folder.

```powershell
python -m pip install -r requirements-dev.txt
python -m uvicorn api.main:app --reload --port 8000     # local
python -m pytest tests -q                               # offline smoke tests
python scripts\verify_setup.py                          # checks Qdrant, Groq, storage and config
```

Render: Root Directory `backend` · Build `pip install -r requirements.txt` ·
Start `uvicorn api.main:app --host 0.0.0.0 --port $PORT` · Health Check Path `/healthz`.

Configuration is in `.env.example` (copy to `.env` locally; use Render's Environment tab in production).
See the [root README](../README.md) for the full guide.
