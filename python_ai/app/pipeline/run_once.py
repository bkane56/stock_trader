import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import configure_app_logging
from app.pipeline.service import generate_initial_recommendations

OUTPUT_DIR = Path("artifacts")


@dataclass
class RunOutput:
    run_id: str
    generated_at: str
    recommendations: list[dict]


def run_once() -> RunOutput:
    configure_app_logging(get_settings())
    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y%m%d%H%M%S")
    recommendations = generate_initial_recommendations(["SPY", "QQQ", "AAPL"])
    output = RunOutput(
        run_id=run_id,
        generated_at=now.isoformat(),
        recommendations=[item.model_dump(mode="json") for item in recommendations],
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"pipeline_run_{run_id}.json"
    output_path.write_text(json.dumps(asdict(output), indent=2), encoding="utf-8")
    return output


if __name__ == "__main__":
    result = run_once()
    print(json.dumps(asdict(result), indent=2))
