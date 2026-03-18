# AI Implementation Plan (Hourly News + Financial Report Recommendations)

## 1) Goal and Scope

Build a Python AI subsystem that:

- Ingests market-relevant text every hour (headlines, SEC filings, earnings materials, curated macro sources).
- Extracts ticker-level signals from those sources.
- Produces explainable recommendation outputs (`buy`, `sell`, `hold`, `consider`) with confidence.
- Combines short-term news impact with medium-term stock outlook factors.
- Serves recommendations to the existing app through an API and persisted storage.

Phase 1 is a **decision-support** tool. Phase 2 introduces **autonomous paper trading** (mock money) with strict risk controls and an operator kill switch.

## 2) Agent Structure (Financial Advisor + Optional Subagents)

The AI system should be designed around a primary **Financial Advisor Agent** that can either do tasks directly or delegate to specialized subagents.

1. **Financial Advisor Agent (Primary Orchestrator)**
   - Owns the decision flow and final recommendation output.
   - Combines outputs from research/news and financial-validation steps.
   - Returns a recommendation per symbol or category: `buy`, `sell`, `hold`, or `consider`.
   - It is valid for the agent to return mostly `hold`/`consider` if no high-conviction opportunities are found.

2. **Research Subagent (Optional but Recommended)**
   - Searches valid online sources and structured feeds for current buy/sell climate.
   - Reads headlines, filings, and relevant macro/sector updates.
   - Produces structured evidence with source links, timestamps, and confidence.

3. **Financial Validation Subagent (Optional but Recommended)**
   - Reviews history and financials for candidate symbols identified by the first step.
   - Checks trend quality, earnings trajectory, balance sheet risk, valuation context, and regime changes.
   - Verifies whether the initial thesis is supported or contradicted by historical/financial context.

4. **Category/Sector Analysis Requirement**
   - Analyze both individual stocks and grouped categories (sectors/industries like consumer goods, energy, healthcare, etc.).
   - Track category-level sentiment and momentum to avoid single-ticker tunnel vision.

## 3) High-Level Architecture

Create a new Python service folder (example: `python_ai/`) with four layers:

1. **Ingestion Layer**
   - Pull hourly data from external providers and public sources.
   - Normalize all content into a common event schema.

2. **NLP + Signal Layer**
   - Classify event type (earnings, guidance, M&A, regulation, macro, litigation, etc.).
   - Score sentiment and event impact at ticker and sector levels.
   - Extract entities (tickers, company names, products, executives, geography).

3. **Recommendation Layer**
   - Combine NLP signal, fundamentals trend, and price/volume context into a weighted score.
   - Map score to recommendation labels with confidence bands.
   - Generate a short rationale with citations to source events.

4. **Serving + Integration Layer**
   - Persist events, features, and recommendations in a database.
   - Expose REST endpoints for the React app and other consumers.
   - Optionally push top recommendation changes to existing backend/websocket channels.

## 4) Data Sources (Phase 1 -> Phase 2)

Start with high-signal, legally safe, and maintainable sources:

- **News/headlines**: premium API (preferred) or curated RSS feeds from trusted publishers.
- **SEC filings**: 8-K, 10-Q, 10-K via SEC EDGAR APIs.
- **Earnings artifacts**: transcripts and press releases from a reliable provider.
- **Macro context**: FOMC releases, CPI/PPI calendar events, selected economic headlines.
- **Market data**: OHLCV + volume/volatility snapshots for confirmation features.

For each source, define:

- update cadence (hourly pull with backfill window),
- rate limits and retry policy,
- source reliability score,
- compliance/licensing notes.

## 5) Core Data Model

Use Postgres (plus optional Redis cache).

Suggested tables:

- `sources` - provider metadata and health.
- `documents` - raw fetched content + normalized body + hash/dedup key.
- `document_entities` - extracted tickers, sectors, people, themes.
- `document_signals` - sentiment, impact, relevance, novelty, event_type.
- `ticker_features_hourly` - merged features per ticker per hour.
- `category_features_hourly` - merged features per sector/industry per hour.
- `recommendations` - action label, confidence, score, horizon, rationale.
- `recommendation_audit` - model version + feature snapshot + source references.

Keep all writes idempotent (unique constraints on source document IDs + hashes).

## 6) Hourly Pipeline Design

Run one orchestrated pipeline every hour (cron/APScheduler/Prefect/Airflow):

- **Cadence must be configurable**:
  - Production default: every 60 minutes.
  - Local/test mode: shorter intervals (for example every 2-5 minutes) or manual one-shot runs.
  - Use environment configuration (example: `PIPELINE_INTERVAL_MINUTES`) so no code changes are needed to switch cadence.

1. **Research + Fetch**
   - Pull new documents for the last 65-75 minutes.
   - Store raw payloads and normalized text.
   - Gather supplemental online context for current market climate.

2. **Deduplicate + Classify**
   - Remove near-duplicate stories (same wire article republished).
   - Classify event type and urgency.

3. **Entity + Signal Extraction**
   - Extract tickers and confidence.
   - Score sentiment and expected directional impact (`-1` to `+1`).
   - Score relevance and novelty (penalize stale repeats).

4. **Feature Build (Ticker + Category)**
   - Merge text-derived signals with market/fundamental features.
   - Build hourly feature vectors per covered ticker and sector/category.

5. **Candidate Selection**
   - Financial Advisor Agent identifies potential symbols/categories to evaluate deeper.

6. **Financial Validation Pass**
   - Review financial history and quality metrics for candidates.
   - Confirm or reject candidate ideas using historical and financial context.

7. **Recommendation Generation**
   - Apply hybrid model/rules engine to output `buy`/`sell`/`hold`/`consider` + confidence.
   - Generate concise rationale and attach top supporting sources.
   - Allow "no strong opportunities" outcomes (recommendations can remain conservative).

8. **Persist + Serve**
   - Write recommendations and audits.
   - Invalidate/refresh caches and expose latest outputs via API.

9. **Monitoring**
   - Emit run success/fail metrics, latency, and source-level completeness.

## 7) Local Development and Test Harness

Support local execution from day one so behavior is observable during development:

- Add a one-shot CLI script (example: `python -m app.pipeline.run_once`) to:
  - fetch latest available data,
  - compute ticker/category recommendations,
  - print/store structured output.
- Add a loop mode script (example: `python -m app.pipeline.run_loop --interval 3`) for rapid local iteration.
- Persist run artifacts for inspection (JSON files and DB rows), including:
  - top recommendations,
  - supporting sources,
  - confidence and rationale fields.
- Add a simple local report command (example: `python -m app.reports.latest`) that summarizes:
  - symbols/categories reviewed,
  - final `buy`/`sell`/`hold`/`consider` decisions,
  - key evidence used.
- Provide fixture-based test mode so you can run without external API calls when needed.

## 8) Modeling Strategy (Practical First Version)

Use a hybrid approach first, then improve with historical learning:

- **NLP components**
  - FinBERT-style sentiment (or provider sentiment endpoint).
  - Zero-shot/small classifier for event type.
  - Named entity recognition tuned for tickers and finance entities.

- **Feature scoring**
  - News impact score = sentiment * relevance * source_trust * novelty.
  - Add modifiers for event type (e.g., guidance cut has higher downside weight).
  - Blend with technical/fundamental context (trend strength, earnings revision trend, valuation regime).

- **Decision mapping**
  - Continuous score -> `buy`/`sell`/`hold`/`consider`.
  - Confidence from model agreement + source quality + signal consistency.

- **Explainability**
  - Store top 3-5 driver features and source snippets for each recommendation.

## 9) Python Service/API Layout

Suggested project structure:

- `python_ai/app/main.py` - FastAPI app bootstrap.
- `python_ai/app/api/` - endpoints (`/recommendations`, `/tickers/{symbol}`, `/pipeline/runs`).
- `python_ai/app/pipeline/` - ingestion, processing, orchestration jobs.
- `python_ai/app/reports/` - local output/report utilities.
- `python_ai/app/agents/` - financial advisor agent + optional subagents.
- `python_ai/app/models/` - NLP wrappers and scoring logic.
- `python_ai/app/storage/` - DB models and repositories.
- `python_ai/app/clients/` - source API clients (news, SEC, transcripts, market data).
- `python_ai/tests/` - unit/integration tests.

Key endpoints:

- `GET /recommendations?watchlist=...&horizon=...`
- `GET /recommendations/{ticker}`
- `GET /recommendations/categories/{category}`
- `GET /signals/{ticker}/latest`
- `GET /health` and `GET /pipeline/runs/latest`
- `GET /pipeline/runs/{run_id}/output`

## 10) Integration with Existing App

- Keep the React app as presentation layer.
- Add backend route(s) that proxy/call the Python AI API if needed.
- Add UI views:
  - recommendation card (action, confidence, horizon),
  - category outlook view (sector-level recommendation climate),
  - rationale panel (why this signal fired),
  - source evidence list (headline/filing links + timestamps),
  - recent recommendation changes timeline.
- Cache recommendation reads for short windows (e.g., 1-5 min) to reduce load.

## 11) Quality, Evaluation, and Risk Controls

Implement validation before trusting outputs:

- **Backtest framework**: simulate hourly recommendations over historical periods.
- **Metrics**:
  - directional accuracy,
  - hit rate by confidence bucket,
  - precision/recall of positive/negative calls,
  - performance vs benchmark and sector-neutral baseline,
  - recommendation mix quality (`buy`/`sell`/`hold`/`consider`) over time.
- **Risk controls**:
  - max confidence cap during sparse data windows,
  - suppress recommendation when signal conflict is high,
  - circuit breaker if ingestion completeness drops below threshold.
- **Human override flags** for earnings day, macro shock, or source outages.

## 12) Autonomous Paper-Trading Progression (Months-Long)

Plan the autonomy rollout in stages rather than a single cutover:

1. **Shadow Mode (2-4 weeks)**
   - Generate signals and hypothetical orders, but execute nothing.
   - Compare model decisions vs benchmark and manual trader expectations.
   - Validate slippage assumptions and market-open behavior.

2. **Paper Trading Mode (8-12+ weeks)**
   - Route decisions to a broker simulator or paper account only.
   - Track full order lifecycle: submit, partial fill, cancel/replace, close.
   - Enforce hard risk limits per position/day before any simulated order is placed.

3. **Autonomous Readiness Gate**
   - Require minimum sample size (trades), stable Sharpe/Sortino, max drawdown thresholds, and operational uptime thresholds.
   - Require no unresolved critical incidents for a defined window (for example 30 days).
   - Require documented sign-off checklist before any live-capital consideration.

4. **Ongoing Safety Controls (always-on)**
   - Global kill switch and per-symbol trading halt.
   - Max position size, max daily loss, max concurrent exposures, sector concentration cap.
   - News shock lockout rules (e.g., temporarily pause around high-volatility events if data quality is degraded).

## 13) Operations and Monitoring

- Structured logging with run IDs and ticker counts.
- Metrics dashboard (Prometheus/Grafana or equivalent):
  - pipeline duration,
  - source latency/error rate,
  - recommendation count distribution,
  - confidence drift over time.
- Alerting:
  - failed hourly runs,
  - stale data (>2 hours),
  - abnormal recommendation spikes.

- **Local visibility requirement**:
  - Every run writes a human-readable summary and machine-readable JSON output so recommendations are easy to inspect while developing locally.

## 14) Security and Compliance

- Secrets in environment variables or secrets manager (never in code).
- Source licensing review and attribution requirements documented.
- Record provenance for each recommendation (which documents influenced it).
- Add disclaimer text in UI/API response metadata.

## 15) Delivery Plan (Moderate Detail)

### Milestone 1 (Week 1-2): Foundation

- Scaffold `python_ai` service with FastAPI + Postgres models.
- Implement 1-2 data sources (news + SEC filings).
- Run hourly ingestion and store normalized documents.
- Add health and run-status endpoints.
- Add local one-shot script and configurable run interval for rapid testing.

### Milestone 2 (Week 3-4): First Recommendations

- Implement sentiment + event classification + ticker extraction.
- Implement financial advisor agent flow with optional research/validation subagents.
- Add sector/category analysis features and outputs.
- Build first feature fusion and recommendation mapping.
- Expose recommendation endpoints and integrate into frontend cards.
- Add rationale + evidence output fields.

### Milestone 3 (Week 5-6): Hardening + Evaluation

- Add backtesting harness and baseline metrics.
- Add monitoring dashboards + alerting.
- Tune thresholds and confidence calibration.
- Add fail-safes and source outage handling.

### Milestone 4 (Week 7-8): Shadow Trading

- Add portfolio simulator and order decision module (`buy/sell/size`).
- Implement transaction cost, spread, and slippage modeling.
- Record hypothetical trades and compare to benchmark performance.
- Add risk guardrails and global kill switch controls.

### Milestone 5 (Week 9+): Paper Trading and Model Upgrades

- Connect to broker paper-trading API (or internal simulator).
- Run autonomous paper trading for months with weekly model/risk reviews.
- Add additional sources (transcripts, macro calendars, alt data).
- Train supervised ranking model from historical outcomes.
- Improve personalization by watchlist/risk profile.

## 16) Database Choice for PoC (Including InstantDB)

`InstantDB` can work for early UI-centric prototyping, but for this AI/trading workflow I recommend **Postgres first**, even in PoC.

- **When InstantDB is acceptable**
  - You are mainly validating front-end experience and basic recommendation display.
  - Data volume is low and you do not need strict relational constraints.
  - You can tolerate limited analytics/query flexibility for backtests and audits.

- **Why Postgres is usually better here (even in PoC)**
  - Strong relational modeling for documents, features, recommendations, and simulated orders.
  - Easier idempotency guarantees and audit trails (critical for trading logic).
  - Better fit for historical analysis/backtesting SQL queries.
  - Smoother path to production without migration pain.

- **Practical compromise**
  - Keep `InstantDB` for rapid UI state sync if you want.
  - Persist authoritative AI/trading data in Postgres from day one.
  - Add Redis only if caching/load patterns require it.

## 17) Suggested Initial Tech Stack

- Python 3.12+
- FastAPI (serving), Pydantic (schema), SQLAlchemy + Alembic (DB)
- APScheduler/Celery/Prefect (hourly orchestration)
- Postgres (+ optional Redis; optional InstantDB only for UI prototyping layer)
- NLP: HuggingFace transformers (FinBERT) + spaCy/regex ticker extraction
- Observability: OpenTelemetry + Prometheus/Grafana
- Testing: pytest + integration tests with fixture documents

## 18) MVP Definition

MVP is complete when:

- The system runs hourly without manual intervention for at least 5 trading days.
- At least 3 source types are ingested and deduplicated.
- Recommendations are available via API for a defined universe of tickers.
- Recommendations are available for both ticker-level and category-level views.
- Each recommendation includes confidence and traceable rationale sources.
- Monitoring catches pipeline failures within 5 minutes.
- Recommendation set is allowed to be conservative (for example, mostly `hold`/`consider` in uncertain conditions).
- Local run/test scripts can execute the full pipeline and show recommendation outputs without production scheduling.

## 19) Paper-Trading Exit Criteria (Before Any Live Capital Discussion)

- Autonomous paper mode runs continuously for at least 8-12 weeks.
- Risk limits are never breached without automatic intervention.
- Performance remains acceptable after transaction costs/slippage assumptions.
- Incident response playbook is tested (kill switch, data outage, broker API outage).
- Audit logs fully reconstruct every recommendation and simulated order decision.

