from datetime import datetime, timezone

from app.schemas.recommendations import Recommendation


def generate_initial_recommendations(
    symbols: list[str],
) -> list[Recommendation]:
    now = datetime.now(timezone.utc)
    return [
        Recommendation(
            symbol=symbol.upper(),
            action="hold",
            confidence=0.25,
            rationale="Initial scaffold recommendation while AI signals are being built.",
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
