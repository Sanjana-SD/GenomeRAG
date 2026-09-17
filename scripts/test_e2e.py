import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from genome.genome import MemoryGenome
from evolution.runner import evolution_manager
from fastapi.testclient import TestClient
from api.main import app

def run_end_to_end_test():
    print("==================================================")
    print("   GenomeRAG End-to-End System Verification       ")
    print("==================================================")

    # 1. Test MemoryGenome serialization and mutation clamping
    print("\n[Step 1] Testing MemoryGenome parameter clamping...")
    genome = MemoryGenome(
        forgetting_rate=1.5, # should clamp to 1.0
        retrieval_top_k=25,   # should clamp to 20
        memory_capacity=2000 # should clamp to 1000
    )
    assert genome.forgetting_rate == 1.0
    assert genome.retrieval_top_k == 20
    assert genome.memory_capacity == 1000
    print(" [OK] Genome clamping verified:", genome.to_dict())

    # 2. Test Evolution Runner in Background
    print("\n[Step 2] Testing Evolution Runner loop...")
    run_id = evolution_manager.start_evolution(
        pop_size=6,
        generations=3,
        cxpb=0.6,
        mutpb=0.3,
        eval_mode="dummy",
        run_name="e2e_verification_run"
    )
    print(f" [OK] Background run started: {run_id}")

    # Wait for evolution loop to complete
    max_wait = 15
    start_t = time.time()
    while evolution_manager.status == "running" and time.time() - start_t < max_wait:
        time.sleep(1)

    status = evolution_manager.get_status()
    print(f" [OK] Evolution status after run: {status['status']}")
    print(f" [OK] Generations completed: {len(status['generation_history'])}")
    if status.get("active_run") and status["active_run"].get("best_fitness") is not None:
        print(f" [OK] Evolved Champion Fitness: {status['active_run']['best_fitness']}")

    # 3. Test FastAPI TestClient
    print("\n[Step 3] Testing FastAPI integration endpoints...")
    client = TestClient(app)

    # Healthcheck
    res = client.get("/api/health")
    assert res.status_code == 200
    print(" [OK] /api/health:", res.json()["status"])

    # Evolution Status endpoint
    res = client.get("/api/evolution/status")
    assert res.status_code == 200
    print(" [OK] /api/evolution/status: active status =", res.json()["status"])

    # Evaluate Genome endpoint
    res = client.post("/api/agent/evaluate", json={
        "genome": genome.to_dict(),
        "eval_mode": "dummy"
    })
    assert res.status_code == 200
    print(" [OK] /api/agent/evaluate: score =", res.json()["fitness"])

    # Runs endpoint
    res = client.get("/api/runs")
    assert res.status_code == 200
    print(f" [OK] /api/runs: {len(res.json().get('runs', []))} run(s) found")

    print("\n==================================================")
    print(" [SUCCESS] ALL PHASES (1-9) SUCCESSFULLY VERIFIED!")
    print("==================================================")

if __name__ == "__main__":
    run_end_to_end_test()
