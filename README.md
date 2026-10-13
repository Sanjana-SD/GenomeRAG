# GenomeRAG

An evolutionary memory framework for AI agents. A chatbot's long-term memory behaviour is controlled by a
**genome** of 10 parameters. A genetic algorithm evolves genomes to recall facts more accurately and quickly,
and the result is compared against a fixed-memory baseline.

The web app has six pages:

| Page | What it shows (all from real backend data) |
|---|---|
| **Dashboard** | Run New Evolution, live generation progress, best/average fitness chart, run status, best-genome preview, recent runs |
| **Genome Explorer** | All 10 genes of the best evolved genome (or the best of any generation), with comparison to the baseline and a separate manual editor |
| **Agent Comparison** | Side-by-side chat with the evolved and baseline agents, using one composer and isolated memories. Shows retrieval, LLM and total latency, retrieved memories and the agent trace |
| **Benchmark Results** | Accuracy and latency for evolved vs. baseline, per-task table, cross-run trend, CSV export, methodology |
| **Experiment History** | Every persisted run, plus per-generation logs |
| **About / Architecture** | System diagram, memory lifecycle, fitness function, limitations |

## Project structure

The frontend and backend are deployed independently: the frontend on **Vercel**, the backend on **Render**.

```
GenomeRAG/
├── frontend/                  React 18 + Vite 6 + Tailwind 4 + Recharts  (deployed on Vercel)
│   ├── src/                   api.js is the single place that talks to the backend
│   ├── package.json, package-lock.json, vite.config.js, index.html
│   └── .env.example           VITE_API_BASE_URL (public value only)
├── backend/                   FastAPI service  (deployed on Render, Root Directory = backend)
│   ├── api/                   main.py (FastAPI app: api.main:app) and store.py (persistence)
│   ├── agent/                 LangGraph agent: retrieve → reason → act → write memory
│   ├── genome/                MemoryGenome, config, embeddings, Qdrant vector store
│   ├── evolution/             DEAP genetic algorithm and the recall benchmark
│   ├── scripts/               schema.sql, verify_setup.py, developer test scripts
│   ├── tests/                 offline pytest smoke tests
│   ├── data/                  local JSON storage (git-ignored)
│   ├── requirements.txt, requirements-dev.txt, .python-version, .env.example
└── README.md
```

Python packages keep their names (`api`, `agent`, `genome`, `evolution`) and are imported relative to `backend/`.
That is why the app entry point is `api.main:app`. Always run Python commands from inside `backend/`.

```
Browser ── React UI (Vercel) ──HTTPS──> FastAPI (Render)
                                         ├─ LangGraph agent (agent/graph.py)
                                         ├─ DEAP GA + benchmark (evolution/), in a background thread
                                         ├─ Storage (api/store.py): local JSON file, or Supabase
                                         ├─ Qdrant Cloud: vector memory, one collection per workload
                                         ├─ sentence-transformers all-MiniLM-L6-v2 (384-d, CPU)
                                         └─ Groq (GROQ_MODEL, default openai/gpt-oss-20b)
```

### Memory isolation (Qdrant)

Each workload has its own collection ([backend/genome/vector_store.py](backend/genome/vector_store.py)). Code selects one
with `use_collection(...)`, which is a context variable, so it works per request and per thread:

| Collection | Used by | Ever cleared by code? |
|---|---|---|
| `genomerag_memories` | Evolved/custom chat agent | Only via the explicit "wipe memory" action (`?confirm=true`) |
| `genomerag_baseline_memories` | Baseline chat agent | Only via the explicit "wipe memory" action |
| `genomerag_benchmark` | Benchmark and evolution, wiped before every task | Yes |
| `genomerag_test` | `scripts/test_*.py` | Yes |

`clear_all_memories()` refuses to clear the two chat collections, so evolution can never erase chat memory.

### The genome and `confidence_threshold`

Retrieval runs these steps in order:
1. Cosine search.
2. Drop memories below `similarity_threshold`.
3. Re-rank by `episodic_weight`/`semantic_weight` and recency (`recency_bias`).
4. Drop memories scoring below `confidence_threshold` × the best memory's score.
5. Keep `retrieval_top_k`.

`confidence_threshold` is this relative cut-off: 0 keeps everything, and 1 keeps only memories tied with the best
one. Consolidation (`consolidation_freq`, `forgetting_rate`, `compression_ratio`, `memory_capacity`) runs at
checkpoints during chats.

### Fitness

```
fitness = mean keyword accuracy − 0.02 × mean end-to-end task latency (seconds)
```

Accuracy is keyword matching: the share of expected keywords that appear in the answer. It is not a semantic
evaluation. The baseline is the fixed default genome (`BASELINE_GENOME` in
[backend/genome/genome.py](backend/genome/genome.py)). An LLM failure such as a rate limit is retried. It is never
scored as a wrong answer, and failed replies are never stored as memories.

## Prerequisites

- Python 3.10+ (tested with 3.13) and Node.js 18+ (tested with 22)
- A Qdrant Cloud cluster and API key
- A Groq API key
- Optional: a Supabase project. With `STORAGE_BACKEND=local`, everything is saved to `backend/data/genomerag_local.json`.

## Local development (no Docker)

```powershell
git clone <repo-url>
cd GenomeRAG

# Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
cd backend
python -m pip install -r requirements-dev.txt      # runtime deps + pytest; use requirements.txt for runtime only
Copy-Item .env.example .env                        # then fill in the values (see "Environment variables")

# Frontend (second terminal)
cd frontend
npm install
```

The backend reads `.env` from `backend/` or from the repo root, so an existing root `.env` keeps working.

**Start the backend** (from `backend/`; the first start takes ~15 s while PyTorch loads):

```powershell
python -m uvicorn api.main:app --reload --port 8000
```

**Start the frontend** (from `frontend/`):

```powershell
npm run dev          # http://localhost:5173, proxies /api and /health to http://127.0.0.1:8000
```

Locally, leave `VITE_API_BASE_URL` unset. To point the dev server at another backend, set `BACKEND_URL` for the proxy.

**Single server (optional):** run `npm run build` in `frontend/`, then open http://localhost:8000. If `frontend/dist`
exists, FastAPI serves it next to the API.

### Environment variables

**Backend** (`backend/.env` locally; the Render "Environment" tab in production):

| Variable | Required | Description |
|---|---|---|
| `QDRANT_URL` | yes | Qdrant cluster endpoint |
| `QDRANT_API_KEY` | yes | Qdrant Cloud → cluster → API Keys |
| `GROQ_API_KEY` | yes | https://console.groq.com/keys |
| `GROQ_MODEL` | no | Groq model id. Default `openai/gpt-oss-20b` |
| `STORAGE_BACKEND` | no | `local`, `supabase` or `auto` (default when unset). See "Storage" below |
| `SUPABASE_URL` | for Supabase | Project Settings → API |
| `SUPABASE_KEY` | for Supabase | The **secret** key (`sb_secret_…` or legacy `service_role`), never the publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Overrides `SUPABASE_KEY` if set |
| `FRONTEND_ORIGINS` | no | Comma-separated browser origins allowed by CORS (`CORS_ORIGINS` is the older name; both work) |
| `FRONTEND_ORIGIN_REGEX` | no | Regex for Vercel preview URLs |
| `GENOMERAG_DATA_DIR` | no | Folder for the local JSON storage (e.g. a Render disk). Default `backend/data` |
| `LOG_LEVEL` | no | `INFO` (default), `DEBUG`, `WARNING` |

**Frontend** (`frontend/.env.local` locally; Vercel → Settings → Environment Variables):

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | production only | The Render service URL, e.g. `https://<your-service>.onrender.com`, with no trailing slash |

Only `VITE_*` values are embedded into the browser bundle, so never put an API key or Supabase secret in one.
`VITE_API_URL` still works as the older name.

### Storage

`STORAGE_BACKEND` selects where runs, generation logs, benchmark results and chat sessions are saved:

| Value | Behaviour |
|---|---|
| `local` | Uses only the local JSON file. Supabase is never contacted, so no client, requests, schema checks or test writes. Supabase settings are optional. The header shows **Storage · Local**. |
| `supabase` | Uses only Supabase. If it is unusable, the error is reported and nothing falls back. |
| `auto` (default) | Uses Supabase when its tables are usable, otherwise the local file, with a warning banner. |

Notes on the local file:
- Writes are atomic: each one goes to a temp file, which then replaces the original.
- Unknown keys and tables in the file are preserved.
- An empty or corrupt file is never overwritten. The backend reports a storage error and leaves the file untouched.
- Back it up like any other data file. It is git-ignored.
- Stop the backend before editing it by hand, because the running backend rewrites it from memory.
- Any other `STORAGE_BACKEND` value stops the backend at startup with a configuration error.
- On Render's free plan the disk is wiped on every restart or redeploy (see "Deploying the backend on Render").

### Database schema (Supabase, only for `supabase`/`auto`)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of [`backend/scripts/schema.sql`](backend/scripts/schema.sql) and click **Run**. It is idempotent and safe to re-run.
   It creates `runs`, `generation_logs`, `benchmark_results`, `chat_sessions` and `chat_messages`.
3. Put the **secret** key in `SUPABASE_KEY`. RLS is enabled with no public policies, so the publishable key cannot read or write.
4. From `backend/`, run `python scripts\verify_setup.py`, or click ⟳ in the app header.

The browser never talks to Supabase or Qdrant directly: only the backend holds those credentials.

## Verification and tests

From `backend/`, with the project venv active:

```powershell
python scripts\verify_setup.py                       # all checks (Qdrant, Groq, storage, config)
python scripts\verify_setup.py config supabase schema   # storage checks; validates the local file in local mode
python -m pytest tests -q                            # offline smoke tests: routes, CORS, validation (no external calls)
python -m scripts.test_storage                       # storage backends (temp files only; no network)
python -m scripts.test_retrieval                     # genome-driven retrieval (uses Qdrant, genomerag_test collection)
python -m scripts.test_agent                         # multi-turn agent (uses Qdrant + Groq, genomerag_test collection)
python -m scripts.test_benchmark                     # benchmark fitness of two genomes (uses Qdrant + Groq)
```

None of these touch chat memory.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Cheap liveness probe: `{"status":"ok"}`, no external calls. Use it as Render's health check |
| GET | `/health` | Real probes of Groq, Qdrant and Supabase (if used), plus the active job and limits. Always returns 200 |
| GET | `/api/genome/default` | Default and baseline genome, bounds, and per-gene descriptions |
| GET | `/api/best-genome` | Best genome across completed runs |
| POST | `/api/chat` | `{message, agent: "evolved"\|"baseline", session_id?, genome?, genome_source?}` returns the reply plus `timings {retrieval_ms, llm_ms, total_ms}`, memories and trace |
| GET | `/api/sessions`, `/api/sessions/{id}` | Persisted conversations |
| DELETE | `/api/sessions/{id}` (alias `/api/chat/{id}`) | Forget a conversation (long-term memory is kept) |
| GET | `/api/memory/stats` | Memory count per collection |
| POST | `/api/memory/{agent}/clear?confirm=true` | Wipe one chat agent's long-term memory |
| POST | `/api/evolve` | `{pop_size 2–12, generations 1–6, benchmark}` starts a run. Returns 202, or 409 if a job is already running |
| GET | `/api/runs`, `/api/runs/{id}` (alias `/api/evolve/{id}`) | Runs, with generation logs and benchmark results |
| GET | `/api/generations?run_id=` | Generation logs |
| POST | `/api/benchmark` | `{run_id}` re-benchmarks that run's best genome against the baseline |
| GET | `/api/benchmarks` | All benchmark executions (for trends) |

## Deploying the backend on Render

Create a **Web Service** from your GitHub repo with the native **Python** runtime (not Docker):

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/healthz` |
| Python version | from `backend/.python-version` (`3.13.5`); or set the env var `PYTHON_VERSION=3.13.5` |

Environment variables to set on Render (names only; get the values from your provider dashboards):

`GROQ_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `GROQ_MODEL`, `STORAGE_BACKEND`, `FRONTEND_ORIGINS`
(and `SUPABASE_URL`, `SUPABASE_KEY` only if `STORAGE_BACKEND` is `supabase` or `auto`).

`FRONTEND_ORIGINS` should contain your Vercel URL. `https://genome-rag-tcvs.vercel.app` is always allowed in addition.
Do not upload a `.env` file.

Things to know before choosing a plan:

- **Memory.** Measured on this project: the server uses about **380 MB right after startup** (PyTorch is imported
  at startup) and about **460 MB once the embedding model has loaded**, before an evolution run adds more.
  Render's free plan has **512 MB** and 0.1 CPU, so it is very likely to be killed for running out of memory or to
  be extremely slow. Plan for **at least 1–2 GB** of RAM. `requirements.txt` pins CPU-only PyTorch wheels so the
  build stays small.
- **First request.** The `all-MiniLM-L6-v2` model (~90 MB) is downloaded on first use, not at startup, so the service
  starts quickly, but the first chat or evolution request is slow.
- **Free-plan sleep.** Free web services spin down after about 15 minutes without traffic, and the first request
  afterwards takes about a minute.
- **Storage.** The free plan has no persistent disk. Either set `STORAGE_BACKEND=supabase`, or use a paid plan with a
  disk and set `GENOMERAG_DATA_DIR` to its mount path. Qdrant memories are unaffected because they live in Qdrant Cloud.
- **Long-running evolution.** `POST /api/evolve` returns immediately and the run executes in a thread inside the
  server process, so `/healthz` and other requests stay responsive. It is **not durable**: if Render restarts,
  redeploys or spins the service down mid-run, the run stops, and at the next startup it is marked `interrupted`
  (generations already finished are kept). While the app is open in a browser, its polling keeps the service awake.
- **One instance only.** Run state and the single-job lock live in memory, so do not scale beyond one instance or worker.

## Deploying the frontend on Vercel

1. Import the repo; set **Root Directory** to `frontend` (preset: Vite; build `vite build`, output `dist`).
2. Add one environment variable: `VITE_API_BASE_URL` = your Render service URL, with no trailing slash.
3. Deploy. Vite inlines this value at build time, so **changing it requires a redeploy**.
4. Remove any backend secrets (`GROQ_API_KEY`, `QDRANT_API_KEY`, `SUPABASE_KEY`, …) from the Vercel project; the frontend does not use them.

## Testing a deployment

```bash
curl https://<your-service>.onrender.com/healthz          # {"status":"ok"}
curl https://<your-service>.onrender.com/health           # Groq / Qdrant / storage status
curl -i -H "Origin: https://genome-rag-tcvs.vercel.app" https://<your-service>.onrender.com/health
#   the response must contain: access-control-allow-origin: https://genome-rag-tcvs.vercel.app
```

Then open the Vercel site. The header should show API / Groq / Qdrant as connected.

## Troubleshooting

- **Browser console shows a CORS error**: add the exact frontend origin (scheme + host, no trailing slash) to `FRONTEND_ORIGINS` on Render and redeploy the backend. For Vercel preview URLs use `FRONTEND_ORIGIN_REGEX`.
- **Frontend says "Cannot reach the backend"**: `VITE_API_BASE_URL` is missing or wrong in Vercel (redeploy after changing it), or the Render service is asleep or crashed. Check `/healthz` directly.
- **Render deploy fails at "Build"**: check the Root Directory is `backend` and the Python version is 3.13.x. A failed `torch` install usually means an unsupported Python version.
- **Render service restarts / "Out of memory"**: the plan has too little RAM (see "Memory" above).
- **`ModuleNotFoundError: No module named 'api'`**: you ran Python from the wrong folder. Run it from `backend/` (on Render, set Root Directory to `backend`).
- **Header shows "Supabase · Schema missing"**: run `backend/scripts/schema.sql`, or set `STORAGE_BACKEND=local`.
- **"Storage error: Local storage file … is not valid JSON"**: the file was left untouched. Restore it from a backup, or move it away to start fresh, then restart.
- **"Permission denied" from Supabase**: you are using the publishable key; switch to the secret key.
- **Groq `model_not_found`**: the model was retired. Run `python scripts\verify_setup.py groq` to list available models, then set `GROQ_MODEL`.
- **Missing or placeholder variables**: `verify_setup.py config` names each one; the backend logs missing variables at startup.
- **Qdrant vector-size error**: a collection was created with another embedding model. Delete it in the Qdrant dashboard and it will be recreated.

## Known limitations

- Keyword-match accuracy is a coarse, lexical metric. Each fitness value is a single noisy pass with a non-deterministic LLM.
- The benchmark tests short-horizon recall of two facts. The forgetting, consolidation and capacity genes barely affect it.
- Evolution is slow (10 LLM calls per genome evaluation) and bounded for the live demo.
- Single-user demo: no authentication. Anyone who can reach the API can start evolutions (spending your Groq quota) and read or wipe stored data, so keep the backend URL private or add a gateway before sharing it widely.
