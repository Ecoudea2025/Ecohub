from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Academic Aggregator API"}

def test_create_search_job():
    response = client.post("/api/v1/search?query=test")
    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "pending"

def test_list_repos():
    response = client.get("/api/v1/repos")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
