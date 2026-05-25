# Skills maintenance

This repo keeps optional agent workflows as Markdown skills under [`.cursor/skills/`](.cursor/skills/). Each skill package is a directory containing `SKILL.md`.

## What files matter

| File | Purpose |
|------|---------|
| [`skills_keep_manifest.json`](skills_keep_manifest.json) | Lists skill directories to **keep** when pruning (see below). |
| [`skills_index.json`](skills_index.json) | Metadata index (`id`, `path`, `description`, etc.) used by `SkillsCatalog` in `python_ai`. |
| [`scripts/prune_skills.py`](scripts/prune_skills.py) | Dry-run or delete skill dirs not listed in the manifest. |
| [`scripts/regenerate_skills_index.py`](scripts/regenerate_skills_index.py) | Rebuild `skills_index.json` from disk (merges prior fields when ids match). |

## Pruning skills

Dry-run (shows counts and sample deletes):

```bash
python3 scripts/prune_skills.py
```

Apply deletes after editing `skills_keep_manifest.json`:

```bash
python3 scripts/prune_skills.py --execute
```

## Regenerating the index

After adds/removals under `.cursor/skills/`, regenerate the index from the repo root:

```bash
cd python_ai && uv run python ../scripts/regenerate_skills_index.py
```

Or from the repo root if `uv` resolves `python_ai` as the project:

```bash
uv run --project python_ai python scripts/regenerate_skills_index.py
```

The script preserves `risk`, `source`, `date_added`, `name`, `description`, and `category` from the previous `skills_index.json` when the same `id` still exists.
