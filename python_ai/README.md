# Python AI Service

Initial FastAPI scaffold for the AI recommendation pipeline.

Agent execution now uses OpenAI's Agents SDK (`openai-agents`) with MCP-backed tool
access. The advisor agent can call a dedicated researcher agent as a tool.

Default agent configuration is OpenAI-first:

- `AI_PROVIDER=openai`
- `AI_MODEL=gpt-4.2`
- `APP_LOG_LEVEL=INFO`
- `AI_SYSTEM_PROMPT=` (optional override)
- `AI_SKILLS_INDEX_PATH=skills_index.json` (optional override)
- `AI_SKILLS_ROOT_PATH=skills` (optional override)
- `AI_SKILLS_PROMPT_LIMIT=15` (optional override)
- `RESEARCH_MIN_BUY_CONFIDENCE=0.60` (filters `top_3_buys`; excludes lower confidence)
- `MORNING_BRIEFING_CASH_RESERVE_RATIO=0.10` (keeps a fixed reserve before cash deployment ideas)

Default prompt text lives in `app/agents/prompts.py` as
`DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT` and
`DEFAULT_RESEARCH_AGENT_SYSTEM_PROMPT`.

The `FinancialAdvisorAgent` appends a skills section to the system prompt and
exposes tool definitions used by the service health surface:

- `search_skills` (discover skills by keyword)
- `read_skill` (load the selected skill's `SKILL.md`)

The research agent (`ResearchAgent`) adds market-intelligence tools:

- `search_web` (broad internet search via Serper API)
- `search_investment_news` (reads recent investment news via Google News RSS)
- `get_sector_performance` (pulls sector ETF momentum via Yahoo quotes)

The main advisor flow can now call:

- `run_market_research` (delegates to the research agent and returns holdings review,
  sector outlook, stock ideas, top 3 buys, and do-not-buy ideas)

## MCP Runtime Notes

- Research MCP servers default to:
  - `uvx mcp-server-fetch`
  - Brave MCP search (when `BRAVE_API_KEY` is configured)
- Trader MCP servers include Polygon MCP, and optionally local servers if present:
  - `accounts_server.py`
  - `push_server.py`
  - `market_server.py` (free-plan local fallback)

## Polygon Free Plan Constraints

The advisor is configured around Polygon free-plan behavior:

- End-of-day oriented stock data only for recommendation context (no real-time snapshot entitlement).
- Approximate rate limit of 5 API calls per minute.
- Tooling should minimize requests and reuse returned context where possible.

## CORS and the Vercel frontend

The React app calls this API using `VITE_PYTHON_AI_BASE_URL` (defaults to `http://127.0.0.1:8010` for local dev only).

**On Vercel**, set `VITE_PYTHON_AI_BASE_URL` to the **public HTTPS URL** where this FastAPI app is deployed. Do **not** point at `127.0.0.1` — each user’s browser would try to talk to *their own* machine, which is wrong and triggers confusing CORS / network errors.

Allow browser origins with:

| Variable | Purpose |
|----------|---------|
| `CORS_ALLOW_ORIGINS` | Comma-separated exact origins, e.g. `https://my-app.vercel.app,http://localhost:3000` |
| `CORS_ALLOW_ORIGIN_REGEX` | Optional; e.g. `https://.*\.vercel\.app` so every Vercel preview deployment works without listing each URL |

Example for previews + local dev:

```bash
CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://my-app.vercel.app
CORS_ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app
```

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
