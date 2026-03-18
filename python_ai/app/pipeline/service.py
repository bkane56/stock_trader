from datetime import datetime, timezone

from app.agents.financial_advisor import FinancialAdvisorAgent
from app.core.config import get_settings
from app.schemas.recommendations import Recommendation


def generate_initial_recommendations(
    symbols: list[str],
) -> list[Recommendation]:
    now = datetime.now(timezone.utc)
    advisor_agent = FinancialAdvisorAgent(settings=get_settings())
    rationale_prefix = advisor_agent.rationale_prefix()
    return [
        Recommendation(
            symbol=symbol.upper(),
            action="hold",
            confidence=0.25,
            rationale=(
                f"{rationale_prefix}. Initial scaffold recommendation while "
                "AI signals are being built."
            ),
            generated_at=now,
        )
        for symbol in symbols
    ]


def latest_pipeline_run_summary() -> dict[str, str | int]:
    return {
        "status": "ok",
        "last_run": datetime.now(timezone.utc).isoformat(),
        "documents_processed": 0,
    }
