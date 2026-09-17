import os
import time
import uuid
import threading
from typing import Optional, Dict, Any, List, Callable
from dotenv import load_dotenv
from deap import tools

from genome.genome import MemoryGenome
from evolution.ga import setup_toolbox, GENE_BOUNDS, evaluate_dummy
from evolution.benchmark import evaluate_genome_fitness

load_dotenv()

# Global run state manager for active background evolution
class EvolutionManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(EvolutionManager, cls).__new__(cls)
                cls._instance.active_run = None
                cls._instance.thread = None
                cls._instance.stop_requested = False
                cls._instance.logs = []
                cls._instance.generation_history = []
                cls._instance.status = "idle" # idle, running, completed, cancelled, error
                cls._instance.error_message = None
        return cls._instance

    def get_supabase_client(self):
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_KEY")
            if url and key:
                return create_client(url, key)
        except Exception as e:
            print(f"Supabase client init error: {e}")
        return None

    def add_log(self, message: str):
        timestamp = time.strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        if len(self.logs) > 500:
            self.logs = self.logs[-500:]

    def start_evolution(
        self,
        pop_size: int = 10,
        generations: int = 5,
        cxpb: float = 0.5,
        mutpb: float = 0.2,
        eval_mode: str = "dummy", # "dummy" or "benchmark"
        run_name: Optional[str] = None
    ) -> str:
        with self._lock:
            if self.status == "running":
                raise RuntimeError("An evolution run is already in progress.")
            
            run_id = run_name or f"run_{int(time.time())}_{uuid.uuid4().hex[:6]}"
            self.active_run = {
                "run_id": run_id,
                "pop_size": pop_size,
                "generations": generations,
                "cxpb": cxpb,
                "mutpb": mutpb,
                "eval_mode": eval_mode,
                "current_gen": 0,
                "best_fitness": None,
                "best_genome": None,
                "started_at": time.time()
            }
            self.logs = []
            self.generation_history = []
            self.stop_requested = False
            self.error_message = None
            self.status = "running"

            # Create entry in Supabase if configured
            supabase = self.get_supabase_client()
            if supabase:
                try:
                    supabase.table("runs").insert({
                        "run_id": run_id,
                        "status": "running",
                        "best_fitness": None,
                        "best_genome": None
                    }).execute()
                except Exception as e:
                    self.add_log(f"Warning: Failed to create run in Supabase: {e}")

            self.thread = threading.Thread(
                target=self._run_loop,
                args=(run_id, pop_size, generations, cxpb, mutpb, eval_mode),
                daemon=True
            )
            self.thread.start()
            return run_id

    def stop_evolution(self):
        with self._lock:
            if self.status == "running":
                self.stop_requested = True
                self.add_log("Stop requested by user. Waiting for current generation to finish...")
                return True
            return False

    def _run_loop(
        self,
        run_id: str,
        pop_size: int,
        generations: int,
        cxpb: float,
        mutpb: float,
        eval_mode: str
    ):
        supabase = self.get_supabase_client()
        try:
            self.add_log(f"Initializing evolution run '{run_id}'...")
            self.add_log(f"Parameters: Pop Size = {pop_size}, Generations = {generations}, Crossover = {cxpb}, Mutation = {mutpb}, Mode = {eval_mode.upper()}")

            # Select evaluation function
            if eval_mode == "benchmark":
                eval_fn = lambda ind: evaluate_genome_fitness(MemoryGenome.from_list(ind))
            else:
                eval_fn = evaluate_dummy

            toolbox = setup_toolbox(evaluation_func=eval_fn)
            pop = toolbox.population(n=pop_size)

            self.add_log(f"Evaluating initial population (Gen 0)...")
            fitnesses = list(map(toolbox.evaluate, pop))
            for ind, fit in zip(pop, fitnesses):
                ind.fitness.values = fit

            # Gen 0 stats
            fits = [ind.fitness.values[0] for ind in pop]
            best_ind = tools.selBest(pop, 1)[0]
            best_genome = MemoryGenome.from_list(best_ind)
            best_fit = max(fits)
            avg_fit = sum(fits) / len(fits)

            gen_0_stat = {
                "generation": 0,
                "best_fitness": round(best_fit, 4),
                "avg_fitness": round(avg_fit, 4),
                "best_genome": best_genome.to_dict()
            }
            self.generation_history.append(gen_0_stat)
            self.active_run["current_gen"] = 0
            self.active_run["best_fitness"] = round(best_fit, 4)
            self.active_run["best_genome"] = best_genome.to_dict()

            self.add_log(f"Gen 0 | Best Fitness: {best_fit:.4f} | Avg Fitness: {avg_fit:.4f}")

            # Persist Gen 0 to Supabase
            if supabase:
                try:
                    supabase.table("generation_logs").insert({
                        "run_id": run_id,
                        "generation_number": 0,
                        "best_fitness": best_fit,
                        "avg_fitness": avg_fit,
                        "best_genome_json": best_genome.to_dict()
                    }).execute()
                except Exception as e:
                    self.add_log(f"Supabase logging error: {e}")

            for gen in range(1, generations + 1):
                if self.stop_requested:
                    self.status = "cancelled"
                    self.add_log(f"Evolution cancelled at generation {gen-1}.")
                    break

                self.add_log(f"--- Generation {gen}/{generations} ---")
                
                # Selection
                offspring = toolbox.select(pop, len(pop))
                offspring = list(map(toolbox.clone, offspring))

                # Crossover
                mated_count = 0
                import random
                for child1, child2 in zip(offspring[::2], offspring[1::2]):
                    if random.random() < cxpb:
                        toolbox.mate(child1, child2)
                        del child1.fitness.values
                        del child2.fitness.values
                        mated_count += 1

                # Mutation
                mutated_count = 0
                for mutant in offspring:
                    if random.random() < mutpb:
                        toolbox.mutate(mutant)
                        del mutant.fitness.values
                        mutated_count += 1

                self.add_log(f"Offspring created: {mated_count} pairs mated, {mutated_count} individuals mutated.")

                # Evaluate invalid individuals
                invalid_ind = [ind for ind in offspring if not ind.fitness.valid]
                self.add_log(f"Evaluating {len(invalid_ind)} new individuals...")
                
                for idx, ind in enumerate(invalid_ind):
                    if self.stop_requested:
                        break
                    ind.fitness.values = toolbox.evaluate(ind)

                if self.stop_requested:
                    self.status = "cancelled"
                    self.add_log(f"Evolution cancelled during generation {gen} evaluation.")
                    break

                pop[:] = offspring

                # Generation statistics
                fits = [ind.fitness.values[0] for ind in pop]
                best_ind = tools.selBest(pop, 1)[0]
                best_genome = MemoryGenome.from_list(best_ind)
                best_fit = max(fits)
                avg_fit = sum(fits) / len(fits)

                gen_stat = {
                    "generation": gen,
                    "best_fitness": round(best_fit, 4),
                    "avg_fitness": round(avg_fit, 4),
                    "best_genome": best_genome.to_dict()
                }
                self.generation_history.append(gen_stat)
                self.active_run["current_gen"] = gen
                self.active_run["best_fitness"] = round(best_fit, 4)
                self.active_run["best_genome"] = best_genome.to_dict()

                self.add_log(f"Gen {gen:2d} | Best Fitness: {best_fit:.4f} | Avg Fitness: {avg_fit:.4f}")

                # Persist generation log to Supabase
                if supabase:
                    try:
                        supabase.table("generation_logs").insert({
                            "run_id": run_id,
                            "generation_number": gen,
                            "best_fitness": best_fit,
                            "avg_fitness": avg_fit,
                            "best_genome_json": best_genome.to_dict()
                        }).execute()
                        supabase.table("runs").update({
                            "best_fitness": best_fit,
                            "best_genome": best_genome.to_dict()
                        }).eq("run_id", run_id).execute()
                    except Exception as e:
                        self.add_log(f"Supabase sync warning: {e}")

            # Finalize run
            if self.status != "cancelled":
                self.status = "completed"
                self.add_log(f"Evolution run '{run_id}' successfully completed!")

            if supabase:
                try:
                    supabase.table("runs").update({
                        "status": self.status,
                        "best_fitness": self.active_run.get("best_fitness"),
                        "best_genome": self.active_run.get("best_genome")
                    }).eq("run_id", run_id).execute()
                except Exception as e:
                    self.add_log(f"Final Supabase status update error: {e}")

        except Exception as e:
            import traceback
            self.status = "error"
            self.error_message = str(e)
            self.add_log(f"Evolution Error: {str(e)}")
            self.add_log(traceback.format_exc())
            if supabase:
                try:
                    supabase.table("runs").update({
                        "status": "error"
                    }).eq("run_id", run_id).execute()
                except Exception:
                    pass

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "error": self.error_message,
            "active_run": self.active_run,
            "generation_history": self.generation_history,
            "logs": self.logs[-50:]
        }

evolution_manager = EvolutionManager()
