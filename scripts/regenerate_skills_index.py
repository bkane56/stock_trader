#!/usr/bin/env python3
"""Rebuild skills_index.json from `.cursor/skills/**/SKILL.md`."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def extract_description(markdown_path: Path) -> str:
    try:
        content = markdown_path.read_text(encoding="utf-8")
    except OSError:
        return "No description provided."

    lines = [line.strip() for line in content.splitlines()]
    in_front_matter = False
    for line in lines:
        if line == "---":
            in_front_matter = not in_front_matter
            continue
        if not in_front_matter:
            continue
        if line.lower().startswith("description:"):
            description = line.split(":", 1)[1].strip().strip('"').strip("'")
            return description or "No description provided."

    for line in lines:
        if not line or line.startswith("#") or line == "---":
            continue
        return line
    return "No description provided."


def infer_category(skill_dir: Path, skills_root: Path) -> str:
    try:
        relative_to_root = skill_dir.relative_to(skills_root)
    except ValueError:
        return "uncategorized"
    parts = relative_to_root.parts
    if len(parts) >= 2:
        return parts[0]
    return "uncategorized"


def load_previous_index(repo_root: Path, index_path: Path) -> dict[str, dict]:
    if not index_path.is_file():
        return {}
    try:
        raw = json.loads(index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, list):
        return {}
    out: dict[str, dict] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id", "")).strip()
        if sid:
            out[sid] = item
    return out


def build_entries(
    repo_root: Path,
    skills_root: Path,
    previous_by_id: dict[str, dict],
) -> list[dict]:
    entries: list[dict] = []
    today = date.today().isoformat()

    if not skills_root.is_dir():
        return entries

    for markdown_path in sorted(skills_root.glob("**/SKILL.md")):
        skill_dir = markdown_path.parent
        skill_id = skill_dir.name.strip()
        if not skill_id:
            continue

        try:
            rel_path = skill_dir.relative_to(repo_root).as_posix()
        except ValueError:
            rel_path = skill_dir.resolve().as_posix()

        description = extract_description(markdown_path)
        category = infer_category(skill_dir, skills_root)

        prev = previous_by_id.get(skill_id, {})
        entry = {
            "id": skill_id,
            "path": rel_path,
            "category": str(prev.get("category") or category).strip()
            or category,
            "name": str(prev.get("name") or skill_id).strip() or skill_id,
            "description": str(prev.get("description") or description).strip()
            or description,
            "risk": str(prev.get("risk") or "unknown").strip() or "unknown",
            "source": str(prev.get("source") or "unknown").strip() or "unknown",
            "date_added": str(prev.get("date_added") or today).strip() or today,
        }
        entries.append(entry)

    entries.sort(key=lambda x: x["id"])
    return entries


def atomic_write_json(path: Path, payload: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=REPO_ROOT,
        help="Repository root",
    )
    parser.add_argument(
        "--skills-root",
        type=Path,
        default=None,
        help="Skills directory (default: <repo>/.cursor/skills)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON path (default: <repo>/skills_index.json)",
    )
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    skills_root = (
        args.skills_root.resolve()
        if args.skills_root is not None
        else repo_root / ".cursor" / "skills"
    )
    output_path = (
        args.output.resolve()
        if args.output is not None
        else repo_root / "skills_index.json"
    )

    previous = load_previous_index(repo_root, output_path)
    entries = build_entries(repo_root, skills_root, previous)
    atomic_write_json(output_path, entries)
    print(f"Wrote {len(entries)} skills to {output_path.relative_to(repo_root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
