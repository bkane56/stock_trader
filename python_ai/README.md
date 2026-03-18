# Python AI Service

Initial FastAPI scaffold for the AI recommendation pipeline.

Default agent configuration is OpenAI-first:

- `AI_PROVIDER=openai`
- `AI_MODEL=gpt-4.2`
- `AI_SYSTEM_PROMPT=` (optional override)

Default prompt text lives in `app/agents/prompts.py` as
`DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT`.

## Commands

- Install dependencies:
  - `uv sync`
- Run API locally:
  - `uv run uvicorn app.main:app --reload`
- Run one pipeline cycle:
  - `uv run python -m app.pipeline.run_once`
- Run loop mode:
  - `uv run python -m app.pipeline.run_loop --interval 3`
- Show latest report:
  - `uv run python -m app.reports.latest`
