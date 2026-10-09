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

## Architecture

```
React 18 + Vite 6 + Tailwind 4 + Recharts  ──HTTP──>  FastAPI (api/main.py)
                                                       ├─ LangGraph agent (agent/graph.py): retrieve → reason → act → write memory
                                                       ├─ DEAP GA (evolution/ga.py) + benchmark (evolution/benchmark.py), in a background thread
                                                       ├─ Storage (api/store.py): Supabase, or the local JSON fallback
                                                       ├─ Qdrant Cloud: vector memory, one collection per workload
                                                       ├─ sentence-transformers all-MiniLM-L6-v2 (384-d, CPU)
                                                       └─ Groq (GROQ_MODEL, default openai/gpt-oss-20b)
```

### Memory isolation (Qdrant)

Each workload has its own collection ([genome/vector_store.py](genome/vector_store.py)). Code selects one with
`use_collection(...)`, which is a context variable, so it works per request and per thread:

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

`confidence_threshold` was previously stored but never used. It is now this relative cut-off: 0 keeps everything,
and 1 keeps only memories tied with the best one. Consolidation (`consolidation_freq`, `forgetting_rate`,
`compression_ratio`, `memory_capacity`) runs at checkpoints during chats.

### Fitness

```
fitness = mean keyword accuracy − 0.02 × mean end-to-end task latency (seconds)
```

Accuracy is keyword matching: the share of expected keywords that appear in the answer. It is not a semantic
evaluation. The baseline is the fixed default genome (`BASELINE_GENOME` in [genome/genome.py](genome/genome.py)).

An LLM failure, such as a rate limit, is retried. It is never scored as a wrong answer, and failed replies are
never stored as memories.

## Prerequisites

- Python 3.10+ (tested with 3.13) and Node.js 18+ (tested with 22)
- A Qdrant Cloud cluster and API key
- A Groq API key
- A Supabase project. This is optional: without it, data is saved to `data/genomerag_local.json`.

## Setup

```powershell
git clone <repo-url>
cd GenomeRAG
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env        # then fill in the values
cd frontend; npm install; cd ..
```

### Environment variables (`.env`, backend only)

| Variable | Required | Description |
|---|---|---|
| `QDRANT_URL` | yes | Qdrant cluster endpoint |
| `QDRANT_API_KEY` | yes | Qdrant Cloud → cluster → API Keys |
| `GROQ_API_KEY` | yes | https://console.groq.com/keys |
| `GROQ_MODEL` | no | Groq model id. Default `openai/gpt-oss-20b` |
| `SUPABASE_URL` | for Supabase | Project Settings → API |
| `SUPABASE_KEY` | for Supabase | Use the **secret** key (`sb_secret_…` or the legacy `service_role` JWT), not the publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Overrides `SUPABASE_KEY` if set |
| `CORS_ORIGINS` | no | Origins allowed to call the API directly |
| `VITE_API_URL` (frontend) | no | Backend URL if the UI is hosted separately. **Never** put secrets in `VITE_*` |

### Database schema (Supabase)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of [`scripts/schema.sql`](scripts/schema.sql) and click **Run**. The script is idempotent and safe to re-run.
   It creates `runs`, `generation_logs`, `benchmark_results`, `chat_sessions` and `chat_messages`.
3. Put the **secret** key in `SUPABASE_KEY`. RLS is enabled with no public policies, so the publishable key cannot read or write.
4. Run `.\.venv\Scripts\python.exe scripts\verify_setup.py`, or click ⟳ in the app header.

The backend checks Supabase by confirming the tables exist and that a test write succeeds. If that check fails, the
app uses the local JSON fallback and shows a banner explaining why, so nothing is ever falsely reported as saved to
Supabase. Data already in the local fallback is not migrated automatically.

## Verification

```powershell
.\.venv\Scripts\python.exe scripts\verify_setup.py                 # all checks
.\.venv\Scripts\python.exe scripts\verify_setup.py qdrant groq     # selected checks
```

## Run locally

**Backend** (from the repo root; the first start takes about 15 s while PyTorch loads):

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000
```

**Frontend (dev):**

```powershell
cd frontend
npm run dev              # http://localhost:5173 (proxies /api and /health to :8000)
```

**Or a single server:** run `npm run build` in `frontend/`, then open http://localhost:8000. FastAPI serves `frontend/dist`.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Real probes of Groq (model list), Qdrant and Supabase (tables and write), plus the active job and limits |
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

Only one evolution or benchmark job runs at a time. Generation logs are saved as each generation finishes, so a
failed run keeps its partial results. Runs left `running` by a backend restart are marked `interrupted`.

## Developer scripts (from the repo root)

```powershell
.\.venv\Scripts\python.exe -m scripts.test_retrieval     # genome-driven retrieval (genomerag_test collection)
.\.venv\Scripts\python.exe -m scripts.test_agent         # multi-turn agent, consolidation/forgetting (genomerag_test)
.\.venv\Scripts\python.exe -m scripts.test_benchmark     # benchmark fitness of two genomes (genomerag_benchmark)
```

None of these touch chat memory.

## Deployment

The repo includes a [`Dockerfile`](Dockerfile). It builds the UI and serves it, together with the API, from one container on port 8000:

```bash
docker build -t genomerag .
docker run --env-file .env -p 8000:8000 -v genomerag-data:/app/data genomerag
```

- It runs on any container host (Render, Railway, Fly.io, Cloud Run, a VM). Give it **≥ 1.5 GB RAM**, because PyTorch and the embedding model are loaded in memory.
- Set the variables from `.env.example` in the host's secret settings. Don't ship a `.env` file.
- `$PORT` is respected if the platform sets it.
- Use a **single instance and a single worker**. Run state and the job lock live in-process.
- Apply `scripts/schema.sql` to Supabase first. Otherwise the container falls back to `/app/data`, which needs a volume to survive restarts.

## Troubleshooting

- **Header shows "Supabase · Schema missing"**: run `scripts/schema.sql` (see above).
- **"Permission denied"**: you're using the publishable key; switch to the secret key.
- **Groq `model_not_found`**: the model was retired. Run `verify_setup.py groq` to list available models and set `GROQ_MODEL`.
- **Rate limits (429)**: the SDK and benchmark retry with backoff. Reduce the population or generations if runs crawl.
- **Wrong interpreter / `ModuleNotFoundError`**: use `.\.venv\Scripts\python.exe` and run scripts with `-m` from the repo root.
- **Qdrant vector-size error**: a collection was created with another embedding model. Delete it in the Qdrant dashboard and it will be recreated.
- **"Backend offline" in the UI / CORS errors**: start the backend on :8000. If the UI is on another origin, set `VITE_API_URL` and add that origin to `CORS_ORIGINS`.

## Known limitations

- Keyword-match accuracy is a coarse, lexical metric. Each fitness value is a single noisy pass with a non-deterministic LLM.
- The benchmark tests short-horizon recall of two facts. The forgetting, consolidation and capacity genes barely affect it.
- Evolution is slow (10 LLM calls per genome evaluation) and bounded for the live demo.
- Single-user demo: no authentication. Long-term chat memory is per agent, shared across that agent's conversations.
