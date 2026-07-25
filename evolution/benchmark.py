import os
import time
from typing import List, Dict, Any, Tuple
from dotenv import load_dotenv
from groq import Groq

from genome.genome import MemoryGenome
from genome.vector_store import store_memory, clear_all_memories
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
            if "429" in err_str or "Rate limit" in err_str or "rate_limit" in err_str:
                delay = base_delay * (2 ** attempt)
                print(f"    [Rate Limit Warning] Received 429. Retrying in {delay:.2f}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(delay)
            else:
                # Other exceptions
                raise e
    raise RuntimeError("Failed to complete LLM call after max retries due to rate limits.")

def evaluate_task(genome: MemoryGenome, task: dict) -> Tuple[float, float]:
    """
    Evaluates a single genome on a single benchmark task.
    Returns: (accuracy_score [0.0 - 1.0], latency_seconds)
    """
    # 1. Clear vector DB for a fresh evaluation
    clear_all_memories()
    
    # 2. Pre-seed the facts into Qdrant using the genome
    # This runs local embeddings on CPU (costs no API limits)
    for step_idx, fact in enumerate(task["context"]):
        store_memory(
            genome=genome,
            text=fact,
            metadata={"type": "episodic", "step": step_idx + 1, "timestamp": time.time()}
        )
        
    # 3. Formulate state for the final RAG turn
    state = {
        "messages": [], # Empty history to force RAG reliance
        "current_input": task["query"],
        "retrieved_memories": [],
        "response": "",
        "step": len(task["context"]),
        "genome": genome,
        "agent_logs": []
    }
    
    # 4. Invoke the agent on the query and measure latency
    start_time = time.time()
    try:
        # Wrap the agent invocation to handle rate limits inside it
        # The agent reasoning node calls Groq, so we handle it here or modify graph
        # For simplicity, we just execute the graph and retry if it throws rate limits
        output = run_api_call_with_retry(agent_app.invoke, state)
        response_text = output["response"]
    except Exception as e:
        print(f"  [Task {task['id']} Error]: {e}")
        response_text = ""
        
    latency = time.time() - start_time
    
    # 5. Calculate Accuracy
    keywords = task["keywords"]
    found_count = 0
    response_lower = response_text.lower()
    for kw in keywords:
        if kw.lower() in response_lower:
            found_count += 1
            
    accuracy = found_count / len(keywords) if keywords else 0.0
    return accuracy, latency

def evaluate_genome_fitness(genome: MemoryGenome, verbose: bool = False) -> Tuple[float]:
    """
    Runs the genome through the benchmark tasks and calculates a fitness score.
    Fitness = Average Accuracy - (Average Latency * Latency Penalty Weight)
    
    Returns: Tuple of (fitness_score,) to match DEAP expectations.
    """
    accuracies = []
    latencies = []
    
    if verbose:
        print(f"Evaluating genome on {len(BENCHMARK_TASKS)} tasks...")
        
    for task in BENCHMARK_TASKS:
        accuracy, latency = evaluate_task(genome, task)
        accuracies.append(accuracy)
        latencies.append(latency)
        
        # Add a tiny rest to prevent Groq burst rate limits
        time.sleep(1.0)
        
    avg_accuracy = sum(accuracies) / len(accuracies)
    avg_latency = sum(latencies) / len(latencies)
    
    # Latency penalty: 0.02 per second of latency.
    # E.g. 1.5 seconds average latency = 0.03 penalty.
    # This prevents overly verbose genomes or deep RAG runs unless they improve accuracy.
    latency_penalty = avg_latency * 0.02
    fitness_score = avg_accuracy - latency_penalty
    
    # Ensure fitness does not drop below -10.0 in case of extreme errors
    fitness_score = max(-10.0, fitness_score)
    
    if verbose:
        print(f"Evaluation complete: Accuracy={avg_accuracy*100:.1f}%, Latency={avg_latency:.2f}s, Score={fitness_score:.4f}")
        
    return (fitness_score,)
