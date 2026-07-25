import os
from dotenv import load_dotenv

# Load env variables before importing modules
load_dotenv()

from genome.genome import MemoryGenome
from evolution.benchmark import evaluate_genome_fitness

def run_benchmark_test():
    print("GenomeRAG - Testing Genome Benchmark and Fitness scoring")
    print("=========================================================")
    
    # 1. Setup hand-picked genomes
    # Sensible genome: standard retrieval, low forgetting, large memory capacity
    sensible_genome = MemoryGenome(
        forgetting_rate=0.0,
        episodic_weight=0.6,
        semantic_weight=0.6,
        confidence_threshold=0.2,
        compression_ratio=0.3,
        retrieval_top_k=5,
        recency_bias=0.2,
        consolidation_freq=50,
        similarity_threshold=0.2,
        memory_capacity=100
    )
    
    # Deliberately bad genome: retrieval_top_k=1, high forgetting_rate, extremely high similarity threshold
    bad_genome = MemoryGenome(
        forgetting_rate=1.0,
        episodic_weight=0.0,
        semantic_weight=0.0,
        confidence_threshold=0.9,
        compression_ratio=0.1,
        retrieval_top_k=1,
        recency_bias=0.9,
        consolidation_freq=5,
        similarity_threshold=0.95,  # Filters out almost all retrieved points
        memory_capacity=50
    )
    
    print("\n--- EVALUATING SENSIBLE GENOME ---")
    print(sensible_genome.to_dict())
    sensible_fit = evaluate_genome_fitness(sensible_genome, verbose=True)
    
    print("\n--- EVALUATING DELIBERATELY BAD GENOME ---")
    print(bad_genome.to_dict())
    bad_fit = evaluate_genome_fitness(bad_genome, verbose=True)
    
    print("\n" + "=" * 60)
    print("BENCHMARK SCORE COMPARISON:")
    print("=" * 60)
    print(f"Sensible Genome Score:    {sensible_fit[0]:.4f}")
    print(f"Deliberately Bad Score:   {bad_fit[0]:.4f}")
    print(f"Performance Delta:        {sensible_fit[0] - bad_fit[0]:.4f}")
    print("=" * 60)

if __name__ == "__main__":
    run_benchmark_test()
