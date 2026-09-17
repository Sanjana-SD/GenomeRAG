import os
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from api.models import (
    GenomeSchema,
    StartEvolutionRequest,
    AgentChatRequest,
    AgentChatResponse,
    EvaluateGenomeRequest,
    HealthResponse
)
from genome.genome import MemoryGenome
from genome.vector_store import clear_all_memories, get_qdrant_client, COLLECTION_NAME
from agent.graph import agent_app
from evolution.runner import evolution_manager
from evolution.ga import evaluate_dummy
from evolution.benchmark import evaluate_genome_fitness

load_dotenv()

app = FastAPI(
    title="GenomeRAG API",
    description="Evolutionary Memory Architecture API for Autonomous LLM Agents",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_supabase_client():
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if url and key:
            return create_client(url, key)
    except Exception as e:
        print(f"Supabase init error: {e}")
    return None

@app.get("/", tags=["System"])
def root():
    return {
        "name": "GenomeRAG API",
        "status": "online",
        "docs_url": "/docs",
        "evolution_status": evolution_manager.status
    }

@app.get("/api/health", response_model=HealthResponse, tags=["System"])
def health():
    # Check Qdrant
    qdrant_ok = False
    try:
        q_client = get_qdrant_client()
        q_client.get_collections()
        qdrant_ok = True
    except Exception:
        pass

    # Check Groq
    groq_ok = bool(os.getenv("GROQ_API_KEY"))

    # Check Supabase
    supabase_ok = False
    supabase = get_supabase_client()
    if supabase:
        try:
            supabase.table("runs").select("run_id").limit(1).execute()
            supabase_ok = True
        except Exception:
            pass

    overall = "healthy" if (qdrant_ok and groq_ok) else "degraded"
    return HealthResponse(
        status=overall,
        qdrant=qdrant_ok,
        groq=groq_ok,
        supabase=supabase_ok,
        message="All systems operational" if (qdrant_ok and groq_ok and supabase_ok) else "Some services unavailable"
    )

# --- EVOLUTION ENDPOINTS ---

@app.post("/api/evolution/start", tags=["Evolution"])
def start_evolution(req: StartEvolutionRequest):
    try:
        run_id = evolution_manager.start_evolution(
            pop_size=req.pop_size,
            generations=req.generations,
            cxpb=req.cxpb,
            mutpb=req.mutpb,
            eval_mode=req.eval_mode,
            run_name=req.run_name
        )
        return {
            "success": True,
            "message": f"Evolution run '{run_id}' started successfully.",
            "run_id": run_id
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/evolution/stop", tags=["Evolution"])
def stop_evolution():
    stopped = evolution_manager.stop_evolution()
    if stopped:
        return {"success": True, "message": "Evolution stop initiated."}
    return {"success": False, "message": "No active evolution run to stop."}

@app.get("/api/evolution/status", tags=["Evolution"])
def get_evolution_status():
    return evolution_manager.get_status()

# --- RUNS & HISTORY (SUPABASE) ---

@app.get("/api/runs", tags=["Runs Archive"])
def get_all_runs():
    supabase = get_supabase_client()
    if not supabase:
        # Fallback to in-memory active run if Supabase is unavailable
        active = evolution_manager.active_run
        return {"runs": [active] if active else []}

    try:
        response = supabase.table("runs").select("*").order("created_at", desc=True).limit(50).execute()
        return {"runs": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/runs/{run_id}", tags=["Runs Archive"])
def get_run_details(run_id: str):
    # Check if this is the active in-memory run
    if evolution_manager.active_run and evolution_manager.active_run.get("run_id") == run_id:
        return {
            "run": evolution_manager.active_run,
            "generations": evolution_manager.generation_history
        }

    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=404, detail="Run not found in memory or database.")

    try:
        run_res = supabase.table("runs").select("*").eq("run_id", run_id).execute()
        if not run_res.data:
            raise HTTPException(status_code=404, detail="Run not found.")

        logs_res = supabase.table("generation_logs").select("*").eq("run_id", run_id).order("generation_number", desc=False).execute()
        return {
            "run": run_res.data[0],
            "generations": logs_res.data or []
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# --- AGENT PLAYGROUND & CHAT ---

@app.post("/api/agent/chat", response_model=AgentChatResponse, tags=["Agent Playground"])
def chat_with_agent(req: AgentChatRequest):
    try:
        # Create genome instance from payload or default
        if req.genome:
            genome = MemoryGenome.from_dict(req.genome.dict())
        else:
            genome = MemoryGenome() # Default baseline genome

        # Format history
        history_msgs = [{"role": m.role, "content": m.content} for m in req.history]

        state = {
            "messages": history_msgs,
            "current_input": req.message,
            "retrieved_memories": [],
            "response": "",
            "step": req.step,
            "genome": genome,
            "agent_logs": []
        }

        # Run agent graph
        output = agent_app.invoke(state)

        return AgentChatResponse(
            response=output.get("response", ""),
            retrieved_memories=output.get("retrieved_memories", []),
            step=output.get("step", req.step + 1),
            agent_logs=output.get("agent_logs", [])
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")

@app.post("/api/agent/evaluate", tags=["Agent Playground"])
def evaluate_genome(req: EvaluateGenomeRequest):
    try:
        genome = MemoryGenome.from_dict(req.genome.dict())
        if req.eval_mode == "benchmark":
            fitness = evaluate_genome_fitness(genome, verbose=False)[0]
        else:
            fitness = evaluate_dummy(genome.to_list())[0]

        return {
            "fitness": round(fitness, 4),
            "eval_mode": req.eval_mode,
            "genome": genome.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

# --- MEMORY MANAGEMENT ---

@app.get("/api/memories", tags=["Memory Store"])
def get_memories(limit: int = 50):
    try:
        client = get_qdrant_client()
        results = client.scroll(
            collection_name=COLLECTION_NAME,
            limit=limit,
            with_payload=True,
            with_vectors=False
        )
        points = results[0]
        memories = [{
            "id": str(p.id),
            "text": p.payload.get("text", ""),
            "metadata": {k: v for k, v in p.payload.items() if k != "text"}
        } for p in points]
        return {"count": len(memories), "memories": memories}
    except Exception as e:
        # Return empty with warning rather than 500
        return {"count": 0, "memories": [], "warning": str(e)}

@app.delete("/api/memories", tags=["Memory Store"])
def clear_memories():
    try:
        clear_all_memories()
        return {"success": True, "message": "All vector memories cleared successfully."}
    except Exception as e:
        return {"success": False, "message": f"Vector DB operation failed: {str(e)}"}
