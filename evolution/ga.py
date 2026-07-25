import random
from typing import List, Tuple
from deap import base, creator, tools
from genome.genome import MemoryGenome

# Define gene bounds for the 10 parameters in order
GENE_BOUNDS = [
    (0.0, 1.0),      # forgetting_rate
    (0.0, 1.0),      # episodic_weight
    (0.0, 1.0),      # semantic_weight
    (0.0, 1.0),      # confidence_threshold
    (0.0, 1.0),      # compression_ratio
    (1.0, 20.0),     # retrieval_top_k
    (0.0, 1.0),      # recency_bias
    (5.0, 100.0),    # consolidation_freq
    (0.0, 1.0),      # similarity_threshold
    (50.0, 1000.0)   # memory_capacity
]

# Set up DEAP fitness and individual classes safely
if not hasattr(creator, "FitnessMax"):
    creator.create("FitnessMax", base.Fitness, weights=(1.0,))
if not hasattr(creator, "Individual"):
    creator.create("Individual", list, fitness=creator.FitnessMax)

def create_individual() -> creator.Individual:
    """Generates an individual with genes randomly distributed within bounds."""
    genes = [random.uniform(low, high) for low, high in GENE_BOUNDS]
    return creator.Individual(genes)

def crossover_blend(ind1: list, ind2: list, alpha: float = 0.5) -> Tuple[list, list]:
    """Applies cxBlend and clamps results to parameter bounds."""
    # Blend genes
    tools.cxBlend(ind1, ind2, alpha=alpha)
    # Clamp bounds
    for i, (low, high) in enumerate(GENE_BOUNDS):
        ind1[i] = max(low, min(high, ind1[i]))
        ind2[i] = max(low, min(high, ind2[i]))
    return ind1, ind2

def mutate_gaussian(individual: list, indpb: float = 0.2) -> Tuple[list]:
    """Applies Gaussian mutation and clamps results to bounds."""
    # Calculate sigmas as 15% of each gene's range
    sigmas = [(high - low) * 0.15 for low, high in GENE_BOUNDS]
    for i in range(len(individual)):
        if random.random() < indpb:
            individual[i] += random.gauss(0, sigmas[i])
            # Clamp bounds
            low, high = GENE_BOUNDS[i]
            individual[i] = max(low, min(high, individual[i]))
    return (individual,)

def evaluate_dummy(individual: list) -> Tuple[float]:
    """
    Toy fitness function designed to optimize towards:
        - forgetting_rate: 0.1
        - retrieval_top_k: 8.0
        - similarity_threshold: 0.5
        - memory_capacity: 500.0
    Returns a fitness score where higher is better (max value is 0.0).
    """
    # Map genes to target values
    f_rate = individual[0]
    top_k = individual[5]
    sim_thresh = individual[8]
    capacity = individual[9]
    
    # Negative absolute error from target
    score = (
        - abs(f_rate - 0.1)
        - abs(top_k - 8.0) / 20.0
        - abs(sim_thresh - 0.5)
        - abs(capacity - 500.0) / 1000.0
    )
    return (score,)

def setup_toolbox(evaluation_func=evaluate_dummy) -> base.Toolbox:
    """Configures the DEAP toolbox with individuals, population, and operators."""
    toolbox = base.Toolbox()
    
    # Generators
    toolbox.register("individual", create_individual)
    toolbox.register("population", tools.initRepeat, list, toolbox.individual)
    
    # Operators
    toolbox.register("mate", crossover_blend, alpha=0.5)
    toolbox.register("mutate", mutate_gaussian, indpb=0.2)
    toolbox.register("select", tools.selTournament, tournsize=3)
    toolbox.register("evaluate", evaluation_func)
    
    return toolbox

def run_evolution_loop(
    toolbox: base.Toolbox,
    pop_size: int = 15,
    generations: int = 10,
    cxpb: float = 0.5,
    mutpb: float = 0.2,
    verbose: bool = True
) -> Tuple[list, list]:
    """Runs a standard Genetic Algorithm loop for the specified generations."""
    # Create initial population
    pop = toolbox.population(n=pop_size)
    
    if verbose:
        print(f"Starting evolution: Population Size = {pop_size}, Generations = {generations}")
        print("Gen | Best Fitness | Avg Fitness | Worst Fitness")
        print("-" * 50)
        
    # Evaluate initial population
    fitnesses = list(map(toolbox.evaluate, pop))
    for ind, fit in zip(pop, fitnesses):
        ind.fitness.values = fit
        
    history = []
    
    for gen in range(1, generations + 1):
        # Select the next generation individuals
        offspring = toolbox.select(pop, len(pop))
        # Clone selected individuals
        offspring = list(map(toolbox.clone, offspring))
        
        # Apply crossover
        for child1, child2 in zip(offspring[::2], offspring[1::2]):
            if random.random() < cxpb:
                toolbox.mate(child1, child2)
                del child1.fitness.values
                del child2.fitness.values
                
        # Apply mutation
        for mutant in offspring:
            if random.random() < mutpb:
                toolbox.mutate(mutant)
                del mutant.fitness.values
                
        # Evaluate individuals with invalid fitness
        invalid_ind = [ind for ind in offspring if not ind.fitness.valid]
        fitnesses = list(map(toolbox.evaluate, invalid_ind))
        for ind, fit in zip(invalid_ind, fitnesses):
            ind.fitness.values = fit
            
        # Replace population with offspring
        pop[:] = offspring
        
        # Gather statistics
        fits = [ind.fitness.values[0] for ind in pop]
        best_fit = max(fits)
        avg_fit = sum(fits) / len(fits)
        worst_fit = min(fits)
        
        # Keep track of best genome
        best_ind = tools.selBest(pop, 1)[0]
        best_genome = MemoryGenome.from_list(best_ind)
        
        history.append({
            "generation": gen,
            "best_fitness": best_fit,
            "avg_fitness": avg_fit,
            "best_genome": best_genome.to_dict()
        })
        
        if verbose:
            print(f"{gen:3d} | {best_fit:12.4f} | {avg_fit:11.4f} | {worst_fit:13.4f}")
            
    best_ind = tools.selBest(pop, 1)[0]
    return pop, history
