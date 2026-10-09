import os
import time
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv
from groq import Groq

from genome.genome import MemoryGenome
from genome.vector_store import store_memory, clear_all_memories, use_collection, BENCHMARK_COLLECTION
from agent.graph import agent_app

# Load env variables
load_dotenv()

# List of 10 benchmark tasks
BENCHMARK_TASKS = [
    {
        "id": 1,
        "context": [
            "I have a loyal dog named Rex who loves playing fetch in the park.",
            "My favorite color is deep blue because it reminds me of the ocean."
        ],
        "query": "What is my dog's name and my favorite color?",
        "keywords": ["Rex", "blue"]
    },
    {
        "id": 2,
        "context": [
            "I moved to Berlin last winter for a software engineering position.",
            "I have started taking night classes to learn the German language."
        ],
        "query": "What city do I live in and what language am I learning?",
        "keywords": ["Berlin", "German"]
    },
    {
        "id": 3,
        "context": [
            "I prefer to drink black coffee every morning exactly at 7 AM.",
            "I am currently reading 'Dune' by Frank Herbert on my e-reader."
        ],
        "query": "What kind of coffee do I drink and what book am I reading?",
        "keywords": ["coffee", "Dune"]
    },
    {
        "id": 4,
        "context": [
            "I am developing an evolutionary memory framework called GenomeRAG.",
            "Our project launch date is scheduled for August 15th."
        ],
        "query": "What is the name of my project and when is the launch date?",
        "keywords": ["GenomeRAG", "August 15"]
    },
    {
        "id": 5,
        "context": [
            "I drive a sleek red Tesla Model 3 to commute to work.",
            "I purchased my electric vehicle back in the year 2022."
        ],
        "query": "What model car do I drive and when did I buy it?",
        "keywords": ["Tesla", "2022"]
    },
    {
        "id": 6,
        "context": [
            "I work at DeepMind as a research scientist.",
            "My current area of work focuses on reinforcement learning agents."
        ],
        "query": "Where do I work and what is my focus area?",
        "keywords": ["DeepMind", "reinforcement learning"]
    },
    {
        "id": 7,
        "context": [
            "I love eating fresh strawberries with yogurt during summer.",
            "I have a severe allergy to peanuts and must carry an EpiPen."
        ],
        "query": "What fruit do I love and what allergy do I have?",
        "keywords": ["strawberries", "peanuts"]
    },
    {
        "id": 8,
        "context": [
            "I practice playing the acoustic piano every single evening.",
            "I commit to practicing about 2 hours per day to improve."
        ],
        "query": "What instrument do I play and how long do I practice?",
        "keywords": ["piano", "2 hours"]
    },
    {
        "id": 9,
        "context": [
            "I plan to visit the historic sites of Tokyo on my next trip.",
            "I have booked my airline flights for the month of October."
        ],
        "query": "What city am I visiting and in what month?",
        "keywords": ["Tokyo", "October"]
    },
    {
        "id": 10,
        "context": [
            "My younger sister's name is Sarah.",
            "She is celebrating her 30th birthday milestone tomorrow."
        ],
        "query": "What is my sister's name and how old is she?",
        "keywords": ["Sarah", "30"]
    }
]

def run_api_call_with_retry(fn, *args, **kwargs):
    """Executes a function with exponential backoff to handle Groq rate limits (HTTP 429)."""
    max_retries = 5
    base_delay = 2.0
    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            if isinstance(e, LLMCallError) or "429" in err_str or "Rate limit" in err_str or "rate_limit" in err_str:
                delay = base_delay * (2 ** attempt)
                print(f"    [Retry] {type(e).__name__}. Retrying in {delay:.2f}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(delay)
            else:
                # Other exceptions
                raise e
    raise RuntimeError("Failed to complete LLM call after max retries due to rate limits.")

class LLMCallError(RuntimeError):
    """The agent's reasoning step failed (e.g. Groq rate limit); the answer must not be scored."""


def _invoke_agent(state: dict) -> dict:
    output = agent_app.invoke(state)
    if output.get("error"):
        raise LLMCallError(output["error"])
    return output


def evaluate_task_detailed(genome: MemoryGenome, task: dict) -> Dict[str, Any]:
    """
    Evaluates a single genome on a single benchmark task in the isolated
    benchmark collection and returns the full record (answer, scores, timings).
    """
    with use_collection(BENCHMARK_COLLECTION):
        # 1. Clear the benchmark collection for a fresh evaluation (never touches chat memory)
        clear_all_memories()

        # 2. Pre-seed the facts using the genome (local CPU embeddings, no API cost)
        for step_idx, fact in enumerate(task["context"]):
            store_memory(
                genome=genome,
                text=fact,
                metadata={"type": "episodic", "step": step_idx + 1, "timestamp": time.time()}
            )

        # 3. Formulate state for the final RAG turn
        state = {
            "messages": [],  # Empty history to force RAG reliance
            "current_input": task["query"],
            "retrieved_memories": [],
            "response": "",
            "step": len(task["context"]),
            "genome": genome,
            "agent_logs": [],
            "timings": {},
        }

        # 4. Invoke the agent and measure end-to-end latency
        start_time = time.time()
        error = None
        output = {}
        try:
            output = run_api_call_with_retry(_invoke_agent, state)
            response_text = output["response"]
        except Exception as e:
            print(f"  [Task {task['id']} Error]: {e}")
            error = f"{type(e).__name__}: {e}"
            response_text = ""
        latency = time.time() - start_time

    # 5. Keyword accuracy: fraction of expected keywords present in the answer (case-insensitive)
    keywords = task["keywords"]
    response_lower = response_text.lower()
    matched = [kw for kw in keywords if kw.lower() in response_lower]
    accuracy = len(matched) / len(keywords) if keywords else 0.0

    timings = output.get("timings", {})
    return {
        "id": task["id"],
        "query": task["query"],
        "keywords": keywords,
        "matched": matched,
        "response": response_text,
        "accuracy": accuracy,
        "latency": latency,
        "retrieval_ms": timings.get("retrieval_ms"),
        "llm_ms": timings.get("llm_ms"),
        "retrieved": len(output.get("retrieved_memories", [])),
        "error": error,
    }


def evaluate_task(genome: MemoryGenome, task: dict) -> Tuple[float, float]:
    """
    Evaluates a single genome on a single benchmark task.
    Returns: (accuracy_score [0.0 - 1.0], latency_seconds)
    """
    r = evaluate_task_detailed(genome, task)
    return r["accuracy"], r["latency"]


LATENCY_PENALTY = 0.02  # fitness points per second of average latency


def run_benchmark(genome: MemoryGenome, verbose: bool = False) -> Dict[str, Any]:
    """Runs all benchmark tasks and returns aggregate metrics plus per-task records.

    fitness = avg_accuracy - LATENCY_PENALTY * avg_latency_seconds (floored at -10)
    """
    tasks = []
    if verbose:
        print(f"Evaluating genome on {len(BENCHMARK_TASKS)} tasks...")

    for task in BENCHMARK_TASKS:
        tasks.append(evaluate_task_detailed(genome, task))
        # Add a tiny rest to prevent Groq burst rate limits
        time.sleep(1.0)

    def avg(values):
        values = [v for v in values if v is not None]
        return sum(values) / len(values) if values else None

    avg_accuracy = avg([t["accuracy"] for t in tasks])
    avg_latency = avg([t["latency"] for t in tasks])

    # Latency penalty: 0.02 per second of latency.
    # E.g. 1.5 seconds average latency = 0.03 penalty.
    # This prevents overly verbose genomes or deep RAG runs unless they improve accuracy.
    fitness_score = max(-10.0, avg_accuracy - avg_latency * LATENCY_PENALTY)

    if verbose:
        print(f"Evaluation complete: Accuracy={avg_accuracy*100:.1f}%, Latency={avg_latency:.2f}s, Score={fitness_score:.4f}")

    return {
        "accuracy": avg_accuracy,
        "avg_latency": avg_latency,
        "avg_retrieval_ms": avg([t["retrieval_ms"] for t in tasks]),
        "avg_llm_ms": avg([t["llm_ms"] for t in tasks]),
        "fitness": fitness_score,
        "errors": sum(1 for t in tasks if t["error"]),
        "tasks": tasks,
    }


def evaluate_genome_fitness(genome: MemoryGenome, verbose: bool = False, details: Optional[dict] = None) -> Tuple[float]:
    """
    Runs the genome through the benchmark tasks and calculates a fitness score.
    Fitness = Average Accuracy - (Average Latency * Latency Penalty Weight)

    If `details` is given it is filled with the full run_benchmark() result.
    Returns: Tuple of (fitness_score,) to match DEAP expectations.
    """
    result = run_benchmark(genome, verbose=verbose)
    if details is not None:
        details.update(result)
    return (result["fitness"],)
