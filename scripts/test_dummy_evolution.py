from dotenv import load_dotenv

# Load env vars before imports
load_dotenv()

from evolution.ga import setup_toolbox, run_evolution_loop
from genome.genome import MemoryGenome

def run_dummy_ga():
    print("GenomeRAG - Running GA Evolution Loop (Dummy Fitness)")
    print("=====================================================")
    
    # 1. Setup toolbox
    toolbox = setup_toolbox()
    
    # 2. Run loop (15 individuals, 10 generations)
    pop, history = run_evolution_loop(
        toolbox=toolbox,
        pop_size=15,
        generations=10,
        cxpb=0.5,
        mutpb=0.2,
        verbose=True
    )
    
    print("\nEvolution complete.")
    
    # 3. Print the best individual
    best_ind = history[-1]
    print(f"Generation 1 Best Fitness: {history[0]['best_fitness']:.4f}")
    print(f"Generation 10 Best Fitness: {best_ind['best_fitness']:.4f}")
    print("\nBest Genome Parameter Values:")
    for param, val in best_ind['best_genome'].items():
        print(f"  - {param:22}: {val}")

if __name__ == "__main__":
    run_dummy_ga()
