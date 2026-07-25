import os
from dotenv import load_dotenv

# Load env variables before importing modules
load_dotenv()

from genome.genome import MemoryGenome
from genome.vector_store import store_memory, retrieve_memory, clear_all_memories

def test_genome_retrieval():
    print("GenomeRAG - Testing Genome-Driven Retrieval")
    print("===========================================")
    
    # 1. Clear collection and store 10 sample facts
    print("Initializing Qdrant collection and storing 10 sample facts...")
    clear_all_memories()
    
    facts = [
        ("The capital of France is Paris.", "episodic"),
        ("The capital of Spain is Madrid.", "episodic"),
        ("The capital of Germany is Berlin.", "episodic"),
        ("The capital of Italy is Rome.", "episodic"),
        ("The capital of Japan is Tokyo.", "episodic"),
        ("The capital of China is Beijing.", "semantic"),
        ("The capital of Canada is Ottawa.", "semantic"),
        ("The capital of Australia is Canberra.", "semantic"),
        ("The capital of Brazil is Brasilia.", "semantic"),
        ("The capital of India is New Delhi.", "semantic")
    ]
    
    # Store facts with a small delay so they have distinct insert times,
    # though for this basic test similarity and k are the main differentiators.
    for i, (text, mem_type) in enumerate(facts):
        store_memory(
            genome=MemoryGenome(),  # standard default genome for writing
            text=text,
            metadata={"type": mem_type, "index": i}
        )
    print("Stored 10 facts successfully!\n")
    
    # 2. Setup different genomes
    # Genome A: Low top_k (2), standard threshold
    genome_a = MemoryGenome(retrieval_top_k=2, similarity_threshold=0.3)
    # Genome B: High top_k (8), standard threshold
    genome_b = MemoryGenome(retrieval_top_k=8, similarity_threshold=0.3)
    # Genome C: High threshold (0.85) - strict
    genome_c = MemoryGenome(retrieval_top_k=5, similarity_threshold=0.85)
    
    query = "Tell me about capital cities of countries"
    print(f"Query: '{query}'\n")
    
    # 3. Retrieve and print results side-by-side / sequentially
    print("-" * 80)
    print(f"GENOME A (top_k={genome_a.retrieval_top_k}, threshold={genome_a.similarity_threshold}):")
    results_a = retrieve_memory(genome_a, query)
    for idx, r in enumerate(results_a):
        print(f"  {idx+1}. [Score: {r['final_score']:.4f}] {r['text']}")
    if not results_a:
        print("  (No results)")
        
    print("-" * 80)
    print(f"GENOME B (top_k={genome_b.retrieval_top_k}, threshold={genome_b.similarity_threshold}):")
    results_b = retrieve_memory(genome_b, query)
    for idx, r in enumerate(results_b):
        print(f"  {idx+1}. [Score: {r['final_score']:.4f}] {r['text']}")
    if not results_b:
        print("  (No results)")
        
    print("-" * 80)
    print(f"GENOME C (top_k={genome_c.retrieval_top_k}, threshold={genome_c.similarity_threshold} - STRICT):")
    results_c = retrieve_memory(genome_c, query)
    for idx, r in enumerate(results_c):
        print(f"  {idx+1}. [Score: {r['final_score']:.4f}] {r['text']}")
    if not results_c:
        print("  (No results - threshold filtered out all matches, as expected)")
    print("-" * 80)

if __name__ == "__main__":
    test_genome_retrieval()
