# 🧬 GenomeRAG: Evolutionary Memory Architecture for Autonomous LLM Agents

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.3+-FF6F00)](https://langchain-ai.github.io/langgraph/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Cloud-DC2626?logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Groq](https://img.shields.io/badge/Groq-Llama_3.1-F55036)](https://groq.com)
[![Supabase](https://img.shields.io/badge/Supabase-Telemetry-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

**GenomeRAG** is an evolutionary memory framework that automatically discovers, tunes, and optimizes the memory dynamics of autonomous LLM agents using Genetic Algorithms (DEAP), Vector Memory (Qdrant), Groq high-speed inference, and Supabase telemetry.

---

## 🏗️ Architecture Overview

```
                          ┌────────────────────────┐
                          │   React/Vite UI App    │
                          │   (Glassmorphic Dark)  │
                          └───────────┬────────────┘
                                      │ REST & Telemetry
                                      ▼
                          ┌────────────────────────┐
                          │     FastAPI Backend    │
                          │      (api/main.py)     │
                          └─────┬────────────┬─────┘
                                │            │
               ┌────────────────┴──┐      ┌──┴─────────────────┐
               ▼                   ▼      ▼                    ▼
      ┌─────────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────┐
      │ Evolution Engine│ │LangGraph Agent│ │ Qdrant Cloud  │ │ Supabase DB  │
      │ (DEAP + Runner) │ │(Reason/Act/  │ │ (Vector Recall│ │ (Runs & Logs  │
      │                 │ │ Consolidate) │ │  & Embeddings)│ │  Telemetry)   │
      └─────────────────┘ └──────────────┘ └───────────────┘ └──────────────┘
```

---

## 🧬 The 10-Parameter Memory Genome

The agent's memory architecture is governed by a 10-gene parameter chromosome:

| Gene | Range | Description |
| :--- | :--- | :--- |
| `forgetting_rate` | `0.0 - 1.0` | Probability of pruning old, low-access memories during consolidation. |
| `episodic_weight` | `0.0 - 1.0` | Relative search weight for raw episodic conversation turns. |
| `semantic_weight` | `0.0 - 1.0` | Relative search weight for consolidated semantic facts. |
| `confidence_threshold` | `0.0 - 1.0` | Minimum confidence score required to form factual assertions. |
| `compression_ratio` | `0.0 - 1.0` | Proportion of oldest episodic memories compressed into semantic summaries. |
| `retrieval_top_k` | `1 - 20` | Number of top memories retrieved for LLM prompt context. |
| `recency_bias` | `0.0 - 1.0` | Exponential decay penalty favoring fresher memories over older ones. |
| `consolidation_freq` | `5 - 100` | Interaction turns between automatic memory consolidation passes. |
| `similarity_threshold` | `0.0 - 1.0` | Cosine similarity cutoff for discarding irrelevant vector points. |
| `memory_capacity` | `50 - 1000` | Hard cap on stored vector memories before oldest overflow is evicted. |

---

## 🚀 Quickstart Guide

### 1. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Vector Database
QDRANT_URL=https://your-qdrant-cluster-url
QDRANT_API_KEY=your-qdrant-api-key

# LLM Inference
GROQ_API_KEY=gsk_your_groq_api_key

# Supabase Telemetry (Optional for cloud logging)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-or-anon-key
```

### 2. Start the FastAPI Backend
```bash
# Activate virtual environment
.\venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000
```
Interactive API docs available at: `http://127.0.0.1:8000/docs`

### 3. Start the React Frontend Dashboard
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🧪 Running Verification Tests

```bash
# 1. Verify Setup & API Connections
.\venv\Scripts\python.exe scripts/verify_setup.py

# 2. Run LangGraph Agent Memory Tests
.\venv\Scripts\python.exe scripts/test_agent.py

# 3. Test Genetic Algorithm Optimization
.\venv\Scripts\python.exe scripts/test_dummy_evolution.py

# 4. Test FastAPI Endpoints
.\venv\Scripts\python.exe scripts/test_api.py

# 5. Run Full End-to-End Verification
.\venv\Scripts\python.exe scripts/test_e2e.py
```

---

## 📁 Repository Structure

```
GenomeRAG/
├── agent/                  # LangGraph Agent Memory Implementation
│   ├── graph.py            # StateGraph with Retrieve, Reason, Act, Consolidate nodes
│   └── state.py            # AgentState definition
├── api/                    # FastAPI Backend Server
│   ├── main.py             # REST routes for evolution, chat, memories & runs
│   └── models.py           # Pydantic schemas
├── evolution/              # Genetic Algorithm Engine
│   ├── ga.py               # DEAP crossover, mutation & selection operators
│   ├── benchmark.py        # 10 realistic RAG evaluation tasks & fitness function
│   └── runner.py           # Async evolution orchestrator with Supabase tracking
├── frontend/               # Modern Glassmorphic Web Dashboard (React + Vite)
│   ├── src/
│   │   ├── components/     # EvolutionTab, GenomeTab, ChatTab, ArchiveTab, Header
│   │   ├── App.jsx         # Main application controller
│   │   └── index.css       # Custom design system tokens & glassmorphism CSS
│   └── package.json
├── genome/                 # Core Genome Definition & Vector Store
│   ├── genome.py           # MemoryGenome dataclass with validation
│   ├── embeddings.py       # Local fast SentenceTransformers embeddings
│   └── vector_store.py     # Qdrant CRUD & genome-weighted similarity search
├── scripts/                # Database schemas & automated test suite
│   ├── schema.sql          # Supabase runs and generation_logs tables
│   ├── test_api.py         # API test suite
│   ├── test_e2e.py         # End-to-end integration test
│   └── verify_setup.py     # Healthcheck verification script
└── requirements.txt        # Pinned Python dependencies
```

---

## 🏆 Completed Project Phases
- ✅ **Phase 1**: Environment setup, dependency pinning, Supabase schema, and verification suite.
- ✅ **Phase 2**: `MemoryGenome` 10-parameter specification, local embeddings, and Qdrant retrieval.
- ✅ **Phase 3**: Single LangGraph agent with forgetting, episodic summarization, and capacity limits.
- ✅ **Phase 4**: DEAP genetic algorithm skeleton with bound clamping and tournament selection.
- ✅ **Phase 5**: Real benchmark tasks with accuracy-latency fitness evaluation.
- ✅ **Phase 6**: Evolution pipeline & Supabase telemetry tracking.
- ✅ **Phase 7**: FastAPI backend engine with REST endpoints and asynchronous run management.
- ✅ **Phase 8**: State-of-the-art interactive React + Vite glassmorphic web dashboard.
- ✅ **Phase 9**: Full end-to-end integration testing and complete documentation.
