import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_details_endpoint() -> None:
    response = client.get("/health/details")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "mode" in payload
    assert "reason" in payload
    assert "configured_provider" in payload
    assert "configured_model" in payload
    assert payload["openai_api_key_configured"] in {"yes", "no"}
    assert payload["serper_api_key_configured"] in {"yes", "no"}
    assert "research_min_buy_confidence" in payload
    assert "configured_advisor_tools" in payload
    assert isinstance(payload["configured_advisor_tools"], list)
    assert "run_market_research" in payload["configured_advisor_tools"]


def test_recommendations_endpoint() -> None:
    response = client.get("/recommendations?watchlist=AAPL,MSFT")
    assert response.status_code == 200
    payload = response.json()
    assert "recommendations" in payload
    assert "tools_used" in payload
    assert isinstance(payload["tools_used"], list)
    assert len(payload["recommendations"]) == 2
    assert payload["recommendations"][0]["action"] == "hold"


def test_research_endpoint() -> None:
    response = client.get("/research?holdings=AAPL,MSFT&focus=technology")
    assert response.status_code == 200
    payload = response.json()
    assert "holdings_review" in payload
    assert "sector_outlook" in payload
    assert "stock_ideas" in payload
    assert "top_3_buys" in payload
    assert "do_not_buy" in payload
    assert "macro_summary" in payload
