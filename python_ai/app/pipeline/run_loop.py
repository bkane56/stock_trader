import argparse
import time

from app.core.config import get_settings
from app.pipeline.run_once import run_once


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Run the AI pipeline in a loop.")
    parser.add_argument(
        "--interval",
        type=int,
        default=settings.PIPELINE_INTERVAL_MINUTES,
        help="Minutes between pipeline runs.",
    )
    args = parser.parse_args()
    interval_seconds = max(1, args.interval) * 60

    while True:
        result = run_once()
        print(f"Completed run {result.run_id} at {result.generated_at}")
        time.sleep(interval_seconds)


if __name__ == "__main__":
    main()
