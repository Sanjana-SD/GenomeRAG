import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import time
from fastapi.testclient import TestClient
from api.main import app

def test_fastapi_endpoints():
    print("Testing GenomeRAG FastAPI Application...")
    client = TestClient(app)

    # 1. Test Root
    res = client.get("/")
    assert res.status_code == 200, f"Root failed: {res.text}"
    print("[OK] Root endpoint verified:", res.json()["name"])

    # 2. Test Health
    res = client.get("/api/health")
    assert res.status_code == 200, f"Healthcheck failed: {res.text}"
    health_data = res.json()
    print(f"[OK] Health endpoint: status={health_data['status']}, Groq={health_data['groq']}, Qdrant={health_data['qdrant']}")

    # 3. Test Evolution Start / Stop (Dummy Mode)
    start_payload = {
        "pop_size": 4,
        "generations": 2,
        "cxpb": 0.5,
        "mutpb": 0.2,
        "eval_mode": "dummy",
        "run_name": "test_api_run"
    }
    res = client.post("/api/evolution/start", json=start_payload)
    assert res.status_code == 200, f"Start evolution failed: {res.text}"
    print("[OK] Evolution started:", res.json()["run_id"])

    # Wait 2 seconds for generation execution
    time.sleep(2)

    # 4. Test Evolution Status
    res = client.get("/api/evolution/status")
    assert res.status_code == 200
    status_data = res.json()
    print(f"[OK] Evolution Status: status={status_data['status']}, Generations Logged={len(status_data['generation_history'])}")

    # 5. Test Genome Evaluation Endpoint
    test_genome = {
        "forgetting_rate": 0.1,
        "episodic_weight": 0.6,
        "semantic_weight": 0.4,
        "confidence_threshold": 0.5,
        "compression_ratio": 0.3,
        "retrieval_top_k": 8,
        "recency_bias": 0.4,
        "consolidation_freq": 20,
        "similarity_threshold": 0.5,
        "memory_capacity": 500
    }
    res = client.post("/api/agent/evaluate", json={"genome": test_genome, "eval_mode": "dummy"})
    assert res.status_code == 200, f"Evaluate genome failed: {res.text}"
    print(f"[OK] Genome evaluate score: {res.json()['fitness']}")

    # 6. Test Memory endpoints
    res = client.get("/api/memories")
    assert res.status_code == 200
    print(f"[OK] Get memories: count={res.json()['count']}")

    print("\n[ALL FASTAPI TESTS PASSED SUCCESSFULLY!]")

if __name__ == "__main__":
    test_fastapi_endpoints()
