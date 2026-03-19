import argparse
import json

from app.core.config import get_settings
from app.core.logging import configure_app_logging
from app.pipeline.service import generate_and_persist_morning_briefing


def _parse_default_holdings(raw: str) -> list[str]:
    return [symbol.strip() for symbol in raw.split(",") if symbol.strip()]


def main() -> None:
    settings = get_settings()
    configure_app_logging(settings)

    parser = argparse.ArgumentParser(description="Generate and persist morning market briefing.")
    parser.add_argument(
        "--holdings",
        type=str,
        default=settings.MORNING_BRIEFING_DEFAULT_HOLDINGS,
        help="Comma-separated holdings symbols.",
    )
    parser.add_argument(
        "--cash",
        type=float,
        default=settings.MORNING_BRIEFING_DEFAULT_CASH,
        help="Available cash for deployment recommendations.",
    )
    parser.add_argument(
        "--focus",
        type=str,
        default="",
        help="Optional research focus override.",
    )
    args = parser.parse_args()

    briefing = generate_and_persist_morning_briefing(
        holdings=_parse_default_holdings(args.holdings),
        cash_available=max(0.0, args.cash),
        focus=args.focus,
    )
    print(json.dumps(briefing.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
