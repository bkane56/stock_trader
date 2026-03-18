# Python AI Service

Initial FastAPI scaffold for the AI recommendation pipeline.

Default agent configuration is OpenAI-first:

- `AI_PROVIDER=openai`
- `AI_MODEL=gpt-4.2`
- `APP_LOG_LEVEL=INFO`
- `AI_SYSTEM_PROMPT=` (optional override)
- `AI_SKILLS_INDEX_PATH=skills_index.json` (optional override)
- `AI_SKILLS_ROOT_PATH=skills` (optional override)
- `AI_SKILLS_PROMPT_LIMIT=15` (optional override)
- `RESEARCH_MIN_BUY_CONFIDENCE=0.60` (filters `top_3_buys`; excludes lower confidence)

Default prompt text lives in `app/agents/prompts.py` as
`DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT` and
`DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT`.

The `FinancialAdvisorAgent` now also appends a skills section to the system prompt
and exposes two tool definitions that can be passed to model tool-calling APIs:

- `search_skills` (discover skills by keyword)
- `read_skill` (load the selected skill's `SKILL.md`)

The research agent (`ResearchAgent`) adds market-intelligence tools:

- `search_web` (broad internet search via Serper API)
- `search_investment_news` (reads recent investment news via Google News RSS)
- `get_sector_performance` (pulls sector ETF momentum via Yahoo quotes)

The main advisor agent can now call:

- `run_market_research` (delegates to the research agent and returns holdings review,
  sector outlook, stock ideas, top 3 buys, and do-not-buy ideas)

## Polygon Free Plan Constraints

The advisor is configured around Polygon free-plan behavior:

- End-of-day oriented stock data only for recommendation context (no real-time snapshot entitlement).
- Approximate rate limit of 5 API calls per minute.
- Tooling should minimize requests and reuse returned context where possible.

## Commands

- Install dependencies:
  - `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv sync --extra dev`
- Run API locally:
  - `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8010`
- Request recommendations:
  - `curl "http://127.0.0.1:8010/recommendations?watchlist=SPY,QQQ,AAPL"`
- Request market research:
  - `curl "http://127.0.0.1:8010/research?holdings=SPY,QQQ,AAPL&focus=technology"`
- Check runtime health details (mode + fallback reason):
  - `curl "http://127.0.0.1:8010/health/details"`
- Run one pipeline cycle:
  - `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run python -m app.pipeline.run_once`
- Run loop mode:
  - `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run python -m app.pipeline.run_loop --interval 3`
- Show latest report:
  - `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run python -m app.reports.latest`

When recommendation generation runs, logs clearly indicate whether execution used
live OpenAI model + skills tools, or fallback scaffold recommendations (with reason).
