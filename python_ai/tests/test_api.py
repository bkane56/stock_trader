import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.api import routes as api_routes


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
    assert "mcp_runtime_configured" in payload
    assert "mcp_runtime_last_run" in payload


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


def test_latest_briefing_endpoint_returns_persisted_payload(monkeypatch) -> None:
    briefing = {
        "execution_mode": "manual",
        "holdings_actions": [
            {
                "symbol": "AAPL",
                "action": "hold",
                "confidence": 0.7,
                "reason": "Quality remains strong.",
            }
        ],
        "cash_deployment_options": [],
        "macro_news_summary": "Macro is mixed but stable.",
        "risk_flags": [
            {
                "category": "macro",
                "severity": "low",
                "summary": "No elevated systemic risks.",
            }
        ],
        "generated_at": "2026-03-19T12:00:00+00:00",
    }

    monkeypatch.setattr(
        api_routes,
        "latest_persisted_morning_briefing",
        lambda: api_routes.MorningBriefingResponse.model_validate(briefing),
    )
    response = client.get("/briefings/latest")
    assert response.status_code == 200
    payload = response.json()
    assert payload["execution_mode"] == "manual"
    assert payload["holdings_actions"][0]["symbol"] == "AAPL"


def test_generate_briefing_endpoint_accepts_payload(monkeypatch) -> None:
    briefing = {
        "execution_mode": "manual",
        "holdings_actions": [
            {
                "symbol": "QQQ",
                "action": "trim",
                "confidence": 0.66,
                "reason": "Risk concentration increased.",
            }
        ],
        "cash_deployment_options": [
            {
                "symbol": "MSFT",
                "sector": "Technology",
                "thesis": "Durable cash flows.",
                "risk": "Valuation risk.",
                "entry_style": "pullback",
                "confidence": 0.64,
            }
        ],
        "macro_news_summary": "Global macro backdrop remains choppy.",
        "risk_flags": [
            {
                "category": "macro",
                "severity": "medium",
                "summary": "Policy uncertainty remains elevated.",
            }
        ],
        "generated_at": "2026-03-19T12:00:00+00:00",
    }
    monkeypatch.setattr(
        api_routes,
        "generate_and_persist_morning_briefing",
        lambda holdings, cash_available, focus: (
            api_routes.MorningBriefingResponse.model_validate(briefing)
        ),
    )
    response = client.post(
        "/briefings/generate",
        json={
            "holdings": ["QQQ"],
            "cash_available": 5000,
            "focus": "general market news",
            "persist": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["execution_mode"] == "manual"
    assert payload["cash_deployment_options"][0]["symbol"] == "MSFT"
