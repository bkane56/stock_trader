# AI-Assisted Paper Trading Platform

**A React/FastAPI paper-trading platform** demonstrating progressive AI autonomy, deterministic risk controls, portfolio-aware recommendation logic, auditable decisions, and cost-aware LLM orchestration.

Built as a portfolio project demonstrating full-stack architecture, OpenAI Agents SDK orchestration, real-time persistence, and accessible UI engineering.

> **Disclaimer:** This application is a hypothetical paper-trading platform built for software engineering and AI architecture demonstration purposes. It does not execute real trades and does not provide financial advice.

---

## Deterministic pipeline

```text
Candidate Universe → Candidate Scoring → Market Data Provider → Portfolio State → Risk Rules → AI Research Summary → Recommendation Decision → Decision Ledger
```

### Cost control

- Configurable free/limited market-data providers (Alpaca IEX, Polygon previous close, or mock)
- Quote caching with provider-specific TTLs (minutes for Alpaca, until next session for Polygon)
- Cached research, scores, and recommendations with configurable TTLs
- Bounded AI calls via configurable budget policy (`MAX_RESEARCH_RUNS_PER_DAY`, `MIN_MINUTES_BETWEEN_RESEARCH_RUNS`)
- Manual refresh controls; UI loads cached briefings unless autonomous mode triggers live generation
- No OpenAI usage for ordinary quote extraction during normal portfolio pricing

### Responsible AI

- Manual mode has no AI trade authority
- Assisted mode requires user approval before execution
- Autonomous mode is paper trading only with deterministic risk checks
- Full audit trail in the Decision Ledger
- Clear disclaimer in README and UI near portfolio value

---

## At a glance

| | |
|---|---|
| **Frontend** | React 19, Vite 6, Redux 5, Tailwind CSS v4, Recharts |
| **Backend** | Python 3.12+, FastAPI, Pydantic v2, OpenAI Agents SDK |
| **Persistence** | InstantDB (auth, portfolios, positions, audit events) |
| **Market data** | Alpaca IEX (preferred), Polygon previous close, mock provider for tests |
| **Deploy** | Vercel (SPA) + Railway/Docker (API) |
| **Quality** | Vitest, vitest-axe (WCAG 2.2), pytest (≥90% target) |

**Repository:** [github.com/bkane56/stock_trader](https://github.com/bkane56/stock_trader)  
**Architecture deep-dive:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

## What it does

1. **Morning briefing** — AI analyzes your holdings, sector context, and cash position; returns structured actions, deployment ideas, and optional trade recommendations.
2. **Three trading modes** — Manual (you trade), Assisted (you approve AI picks), Autonomous (AI executes within guardrails during market hours).
3. **Portfolio tracking** — Real-time sync via InstantDB with intraday price refresh, P&L metrics, and transaction history.
4. **Strategy builder** — Growth vs fixed-income allocation with visual breakdown.
5. **Risk guardrails** — Cash reserve floor, position count limits, confidence thresholds, and fee-ratio caps before autonomous execution.

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser["React SPA · Vercel"]
        direction TB
        Pages[Dashboard · Portfolio · Strategy · About]
        Store[Redux — portfolio + trade state]
        Hooks[Briefing · Sync · Autonomous hooks]
        Pages --> Store
        Pages --> Hooks
    end

    subgraph Cloud["Backend · FastAPI"]
        direction TB
        REST["/briefings · /quotes · /research"]
        Agents[OpenAI Agents SDK]
        FA[Financial Advisor Agent]
        RA[Research Agent]
        REST --> Agents
        Agents --> FA
        FA --> RA
    end

    subgraph Data["Data & services"]
        IDB[(InstantDB)]
        PG[Polygon.io]
        LLM[OpenAI API]
    end

    Hooks <-->|HTTPS| REST
    Hooks <-->|sync| IDB
    REST --> PG
    Agents --> LLM
```

### End-to-end briefing flow

```mermaid
sequenceDiagram
    participant UI as React Dashboard
    participant DB as InstantDB
    participant API as FastAPI
    participant AI as Agent Pipeline

    UI->>DB: Load portfolio
    UI->>API: Refresh holding prices
    UI->>API: POST /briefings/generate
    API->>AI: Research → Advisor synthesis
    AI-->>API: Structured briefing JSON
    API-->>UI: Actions + recommendations
    Note over UI: Assisted: user approves<br/>Autonomous: auto-execute (market hours)
    UI->>DB: Record trades + events
```

Full diagrams (AI pipeline, deployment, data model): **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

## Tech stack

### Frontend (`ui/src/`)

- **React 19** + **Vite 6** — SPA with lazy-loaded modals and strategy page
- **Redux 5** — Global portfolio and trade state; hydrated from InstantDB on load
- **React Router 7** — Client routing with accessible nav landmarks
- **Tailwind CSS v4** — Mobile-first responsive layout, dark mode
- **InstantDB** — Magic-code auth, real-time portfolio persistence
- **Vitest + Testing Library + vitest-axe** — Unit tests and WCAG checks

### Backend (`python_ai/`)

- **FastAPI** — REST API with OpenAPI at `/docs`
- **OpenAI Agents SDK** — Multi-agent orchestration with MCP tool servers
- **Pydantic v2** — Typed request/response contracts for UI consumption
- **uv** — Dependency and virtualenv management
- **pytest** — API, agent, briefing, and market-hours tests

### External integrations

- **Polygon.io / Alpaca** — Configurable quote providers with caching and freshness metadata
- **Serper / Google News / Yahoo** — Research agent market intelligence
- **Optional MCP servers** — Fetch, Playwright, Brave search, Polygon MCP

---

## Project structure

```
stock_trader/
├── ui/src/
│   ├── App.jsx                 # Shell, routing, trade orchestration
│   ├── containers/             # Dashboard, Portfolio, Strategy, About
│   ├── hooks/                  # Briefing, portfolio sync, autonomous trading
│   ├── reducers/               # Redux slices
│   └── services/               # API clients, InstantDB store
├── python_ai/
│   ├── app/
│   │   ├── api/routes.py       # REST endpoints
│   │   ├── agents/             # Financial advisor + research agents
│   │   ├── services/           # Universe, scoring, risk, decisions, ledger
│   │   └── pipeline/           # Orchestrator, briefing logic, persistence
│   └── tests/
├── instant.schema.ts           # InstantDB schema
├── ARCHITECTURE.md             # System design (Mermaid diagrams)
└── vercel.json                 # Frontend deploy config
```

---

## Run locally

**Prerequisites:** Node.js 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/)

### 1. Frontend

```bash
yarn install
cp .env.example .env.local   # add keys below
yarn dev                     # http://localhost:3000
```

### 2. Backend

```bash
cd python_ai && uv sync --extra dev
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

Health check: `curl http://127.0.0.1:8010/health/details`

### 3. Environment variables

| Variable | Layer | Purpose |
|----------|-------|---------|
| `VITE_INSTANTDB_APP_ID` | Frontend | Portfolio persistence + auth |
| `VITE_PYTHON_AI_BASE_URL` | Frontend | API base URL (default `http://127.0.0.1:8010`) |
| `MARKET_DATA_PROVIDER` | Backend | `alpaca`, `polygon`, or `mock` |
| `VITE_MARKET_DATA_PROVIDER` | Frontend | UI pricing source label (should match backend) |
| `OPENAI_API_KEY` | Backend | Agent execution |
| `ALPACA_API_KEY_ID` / `ALPACA_API_SECRET_KEY` | Backend | Alpaca IEX quotes (paper trading marks) |
| `POLYGON_API_KEY` | Backend | Polygon previous-close fallback |
| `AI_PROVIDER` / `AI_MODEL` | Backend | Model selection (default OpenAI) |

See [`.env.example`](.env.example) and [INSTANTDB_SETUP.md](INSTANTDB_SETUP.md) for the full list.

---

## Deploy

| Target | Guide |
|--------|--------|
| **Frontend (Vercel)** | `yarn vercel:preview` / `yarn vercel:prod` — see [Vercel section below](#vercel-deployment) |
| **API (Railway/Docker)** | [python_ai/DEPLOY.md](python_ai/DEPLOY.md) |
| **InstantDB** | [INSTANTDB_SETUP.md](INSTANTDB_SETUP.md) |

Set `VITE_PYTHON_AI_BASE_URL` on Vercel to your **HTTPS** API URL. Configure `CORS_ALLOW_ORIGINS` on the API for your Vercel domain.

---

## Vercel deployment

This repo includes `vercel.json` for Vite SPA routing.

```bash
npx vercel@48.6.0 link --yes -p stock-trader   # one-time
yarn vercel:dev                                 # local Vercel dev
yarn vercel:preview                             # preview deploy
yarn vercel:prod                                # production deploy
```

**Preview vs production:** Only `yarn vercel:prod` uses Production env vars. Preview deploys use Preview env vars in the Vercel dashboard.

**Required Vercel env vars:** `VITE_INSTANTDB_APP_ID`, `VITE_PYTHON_AI_BASE_URL` (HTTPS, not `127.0.0.1`).

CORS details: [python_ai/README.md](python_ai/README.md#cors-and-the-vercel-frontend)

---

## Engineering highlights

- **Structured AI outputs** — Pydantic schemas end-to-end; execution logic is deterministic, not prompt-dependent
- **Market-hours awareness** — Autonomous trading gated on US equity session (frontend + backend)
- **Accessibility** — Semantic landmarks, labeled controls, dialog focus traps, automated axe checks in CI path
- **Resilient briefing** — Generate with fallback to last persisted briefing artifact
- **Separation of concerns** — Agents recommend; guardrails and user mode decide execution

---

## Tests

```bash
yarn test                    # frontend unit + a11y
cd python_ai && uv run pytest   # backend
```

---

## License

Apache-2.0 (see file headers).
