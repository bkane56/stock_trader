#!/usr/bin/env python3
"""Dry-run or execute pruning of `.cursor/skills` against skills_keep_manifest.json."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPO_ROOT / "skills_keep_manifest.json"
DEFAULT_SKILLS_ROOT = REPO_ROOT / ".cursor" / "skills"


def load_keep_paths(manifest_path: Path, repo_root: Path) -> set[Path]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw = data.get("keep_skill_dirs")
    if not isinstance(raw, list):
        raise ValueError("keep_skill_dirs must be a list")
    resolved: set[Path] = set()
    for item in raw:
        p = Path(str(item).strip())
        resolved.add((repo_root / p).resolve())
    return resolved


def discover_skill_dirs(skills_root: Path) -> list[Path]:
    if not skills_root.is_dir():
        return []
    return sorted({md.parent.resolve() for md in skills_root.glob("**/SKILL.md")})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help="Path to skills_keep_manifest.json",
    )
    parser.add_argument(
        "--skills-root",
        type=Path,
        default=DEFAULT_SKILLS_ROOT,
        help="Root directory containing skills",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Remove skill directories not in the manifest (destructive)",
    )
    parser.add_argument(
        "--limit-print",
        type=int,
        default=30,
        help="Max delete candidates to print in dry-run mode",
    )
    args = parser.parse_args()

    repo_root = REPO_ROOT
    skills_root = args.skills_root.resolve()
    manifest_path = args.manifest.resolve()

    if not manifest_path.is_file():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    keep = load_keep_paths(manifest_path, repo_root)
    discovered = set(discover_skill_dirs(skills_root))

    manifest_typos: list[Path] = []
    for p in sorted(keep):
        md = p / "SKILL.md"
        if not p.is_dir() or not md.is_file():
            manifest_typos.append(p)

    would_keep = sorted(discovered & keep)
    would_delete = sorted(discovered - keep)

    print(f"Discovered skill dirs: {len(discovered)}")
    print(f"Manifest keep paths (resolved): {len(keep)}")
    print(f"On disk and kept: {len(would_keep)}")
    print(f"Manifest typos (missing dir or SKILL.md): {len(manifest_typos)}")
    print(f"Would delete: {len(would_delete)}")

    if manifest_typos:
        print("\nManifest typos:")
        for p in manifest_typos:
            try:
                rel = p.relative_to(repo_root)
            except ValueError:
                rel = p
            print(f"  {rel}")

    if args.execute:
        would_delete.sort(key=lambda p: len(p.parts), reverse=True)
        for p in would_delete:
            try:
                rel = p.relative_to(repo_root)
            except ValueError:
                rel = p
            shutil.rmtree(p)
            print(f"deleted {rel}")
        print(f"\nRemoved {len(would_delete)} skill directories.")
        return 0

    lim = max(0, args.limit_print)
    if would_delete and lim:
        print(f"\nDelete candidates (showing up to {lim}):")
        for p in would_delete[:lim]:
            try:
                rel = p.relative_to(repo_root)
            except ValueError:
                rel = p
            print(f"  {rel}")
        if len(would_delete) > lim:
            print(f"  ... and {len(would_delete) - lim} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
