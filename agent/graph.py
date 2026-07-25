import os
import time
import random
import json
from typing import List, Dict, Any
from groq import Groq
from langgraph.graph import StateGraph, START, END

from agent.state import AgentState
from genome.genome import MemoryGenome
from genome.vector_store import store_memory, retrieve_memory, get_qdrant_client, COLLECTION_NAME

# Initialize Groq client
def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment.")
    return Groq(api_key=api_key)

# Node 1: Retrieve memories
def retrieve_node(state: AgentState) -> Dict[str, Any]:
    current_input = state["current_input"]
    genome = state["genome"]
    logs = list(state.get("agent_logs", []))
    
    logs.append(f"[Step {state.get('step', 0)}] Retrieving memories for query: '{current_input}'")
    
    # Retrieve memories from Qdrant using genome retrieval parameters
    memories = retrieve_memory(genome, current_input)
    
    logs.append(f"Retrieved {len(memories)} memory/memories matching threshold.")
    for idx, mem in enumerate(memories):
        logs.append(f"  - [{mem['metadata'].get('type')} score={mem['final_score']:.3f}] {mem['text'][:60]}...")
        
    return {
        "retrieved_memories": memories,
        "agent_logs": logs
    }

# Node 2: Reason using Groq and retrieved memories
def reason_node(state: AgentState) -> Dict[str, Any]:
    current_input = state["current_input"]
    retrieved = state.get("retrieved_memories", [])
    history = state.get("messages", [])
    logs = list(state.get("agent_logs", []))
    
    client = get_groq_client()
    
    # Format retrieved memories for prompt
    memories_str = ""
    if retrieved:
        memories_str = "\n".join([f"- [{m['metadata'].get('type')}] {m['text']}" for m in retrieved])
    else:
        memories_str = "No relevant long-term memories retrieved."
        
    system_prompt = (
        "You are GenomeRAG, an autonomous AI agent with an evolutionary memory architecture.\n"
        "You have access to the following recalled long-term memories:\n"
        f"{memories_str}\n\n"
        "Instructions: Incorporate relevant recalled memories into your response to show continuity. "
        "The recalled memories are facts about the current user or past turns of this conversation. "
        "If you see facts about a person (e.g. 'Alice'), assume the user you are talking to is that person. "
        "Keep your response natural, conversational, and direct."
    )
    
    # Construct message array
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": current_input})
    
    logs.append("Sending reasoning prompt to Groq (Llama 3.1 8B)...")
    
    # API Call
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            max_tokens=250,
            temperature=0.7
        )
        response_text = completion.choices[0].message.content.strip()
        logs.append(f"Generated response: '{response_text[:80]}...'")
    except Exception as e:
        response_text = f"Error during reasoning: {e}"
        logs.append(f"Groq API call error: {e}")
        
    return {
        "response": response_text,
        "agent_logs": logs
    }

# Node 3: Act (Pass-through / Formatting / Verification)
def act_node(state: AgentState) -> Dict[str, Any]:
    logs = list(state.get("agent_logs", []))
    logs.append("Agent executed actions: finalized conversation turn.")
    return {
        "agent_logs": logs
    }

# Node 4: Write Memory + Forgetting + Consolidation
def write_memory_node(state: AgentState) -> Dict[str, Any]:
    current_input = state["current_input"]
    response = state["response"]
    genome = state["genome"]
    step = state.get("step", 0) + 1
    logs = list(state.get("agent_logs", []))
    
    # 1. Store this interaction as an episodic memory
    interaction_text = f"User: {current_input}\nAssistant: {response}"
    store_memory(
        genome=genome,
        text=interaction_text,
        metadata={"type": "episodic", "step": step, "timestamp": time.time()}
    )
    logs.append(f"Stored current conversation turn as episodic memory (Step {step}).")
    
    # 2. Check for consolidation checkpoint
    if step % genome.consolidation_freq == 0:
        logs.append(f"[Consolidation Checkpoint at Step {step}] Running forgetting and compression loops...")
        
        qdrant_client = get_qdrant_client()
        current_time = time.time()
        
        # Scroll to retrieve all points in the collection (up to limit of 1000)
        try:
            scroll_results = qdrant_client.scroll(
                collection_name=COLLECTION_NAME,
                limit=1000,
                with_payload=True
            )
            points = scroll_results[0]
        except Exception as e:
            logs.append(f"Error fetching memories for consolidation: {e}")
            points = []
            
        if points:
            episodic_points = []
            semantic_points = []
            
            for p in points:
                p_type = p.payload.get("type", "episodic")
                if p_type == "episodic":
                    episodic_points.append(p)
                else:
                    semantic_points.append(p)
            
            # --- LOOP A: FORGETTING ---
            # Probabilistically prune memories based on forgetting_rate and age in steps
            forgotten_ids = []
            for p in points:
                mem_step = p.payload.get("step", step)
                age_steps = max(0, step - mem_step)
                # Any memory older than the current step is subject to the forgetting_rate probability
                forget_prob = genome.forgetting_rate if age_steps > 0 else 0.0
                
                if random.random() < forget_prob:
                    forgotten_ids.append(p.id)
                    
            if forgotten_ids:
                qdrant_client.delete(
                    collection_name=COLLECTION_NAME,
                    points_selector=forgotten_ids
                )
                logs.append(f"Forgetting: Pruned {len(forgotten_ids)} old, low-relevance memories.")
                # Filter deleted points from our working lists
                episodic_points = [p for p in episodic_points if p.id not in forgotten_ids]
                semantic_points = [p for p in semantic_points if p.id not in forgotten_ids]
            else:
                logs.append("Forgetting: No memories pruned at this checkpoint.")
                
            # --- LOOP B: COMPRESSION / SUMMARIZATION ---
            # If we have enough episodic memories, compress a portion of the oldest ones into a semantic summary
            # We compress if there are at least 4 episodic memories
            if len(episodic_points) >= 4:
                # Sort episodic memories by step or timestamp (oldest first)
                episodic_points.sort(key=lambda x: x.payload.get("step", 0))
                
                # Determine how many memories to compress based on compression_ratio
                # Minimum of 2, up to len(episodic_points) - 1
                num_to_compress = max(2, int(len(episodic_points) * genome.compression_ratio))
                num_to_compress = min(num_to_compress, len(episodic_points) - 1)
                
                compress_candidates = episodic_points[:num_to_compress]
                
                # Create a prompt for the LLM to summarize/consolidate
                memories_to_summarize = "\n".join([f"- {p.payload.get('text')}" for p in compress_candidates])
                
                summary_prompt = (
                    "You are a memory consolidation module for an AI agent.\n"
                    "Your job is to read these episodic interaction logs and consolidate them into a "
                    "single, concise semantic summary. Extract only the key facts and user details, "
                    "omitting filler dialogue. Write in the third person.\n\n"
                    "Logs to consolidate:\n"
                    f"{memories_to_summarize}\n\n"
                    "Semantic Summary:"
                )
                
                try:
                    groq_client = get_groq_client()
                    summary_completion = groq_client.chat.completions.create(
                        model="llama-3.1-8b-instant",
                        messages=[{"role": "user", "content": summary_prompt}],
                        max_tokens=150,
                        temperature=0.3
                    )
                    summary_text = summary_completion.choices[0].message.content.strip()
                    
                    # Store the summary as a semantic memory
                    store_memory(
                        genome=genome,
                        text=f"[Consolidated Memory] {summary_text}",
                        metadata={"type": "semantic", "step": step, "timestamp": time.time()}
                    )
                    
                    # Delete the original episodic memories that were compressed
                    delete_ids = [p.id for p in compress_candidates]
                    qdrant_client.delete(
                        collection_name=COLLECTION_NAME,
                        points_selector=delete_ids
                    )
                    
                    logs.append(f"Compression: Consolidated {len(delete_ids)} episodic memories into 1 semantic summary: '{summary_text[:80]}...'")
                    
                    # Update episodic points list
                    episodic_points = episodic_points[num_to_compress:]
                except Exception as e:
                    logs.append(f"Compression error: {e}")
            else:
                logs.append("Compression: Insufficient episodic memories to trigger consolidation (need at least 4).")
                
            # --- LOOP C: CAPACITY ENFORCEMENT ---
            # If total memories exceed capacity, delete the oldest remaining episodic memories
            total_points = len(episodic_points) + len(semantic_points)
            if total_points > genome.memory_capacity:
                overflow = total_points - genome.memory_capacity
                logs.append(f"Capacity: Memory count ({total_points}) exceeds capacity ({genome.memory_capacity}). Pruning oldest {overflow} memories.")
                
                # Combine all and sort by step/timestamp (oldest first)
                all_remaining = episodic_points + semantic_points
                all_remaining.sort(key=lambda x: x.payload.get("step", 0))
                
                prune_ids = [p.id for p in all_remaining[:overflow]]
                qdrant_client.delete(
                    collection_name=COLLECTION_NAME,
                    points_selector=prune_ids
                )
                logs.append(f"Capacity: Pruned {len(prune_ids)} overflow memories.")
                
    return {
        "step": step,
        "agent_logs": logs
    }

def math_decay_helper(age_seconds: float, half_life_seconds: float) -> float:
    """Helper to compute exponent decay."""
    import math
    return math.exp(-0.693 * age_seconds / half_life_seconds)

# Assemble and compile the StateGraph
def build_agent_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("retrieve", retrieve_node)
    workflow.add_node("reason", reason_node)
    workflow.add_node("act", act_node)
    workflow.add_node("write_memory", write_memory_node)
    
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "reason")
    workflow.add_edge("reason", "act")
    workflow.add_edge("act", "write_memory")
    workflow.add_edge("write_memory", END)
    
    return workflow.compile()

# Global Compiled App instance
agent_app = build_agent_graph()
