import json
from pathlib import Path

ARTIFACTS_DIR = Path("artifacts")


def latest_report() -> dict:
    files = sorted(ARTIFACTS_DIR.glob("pipeline_run_*.json"))
    if not files:
        return {
            "status": "no_runs",
            "message": "No pipeline artifacts found. Run `python -m app.pipeline.run_once` first.",
        }
    latest_file = files[-1]
    return json.loads(latest_file.read_text(encoding="utf-8"))


def latest_morning_briefing() -> dict:
    files = sorted(ARTIFACTS_DIR.glob("morning_briefing_*.json"))
    if not files:
        return {
            "status": "no_briefings",
            "message": "No morning briefing artifacts found. Run the morning briefing job first.",
        }
    latest_file = files[-1]
    return json.loads(latest_file.read_text(encoding="utf-8"))


if __name__ == "__main__":
    report = latest_report()
    print(json.dumps(report, indent=2))
