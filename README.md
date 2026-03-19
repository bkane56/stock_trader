<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3a903b97-ee2b-4e83-b710-e94ce163a3d3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `yarn install`
2. Copy [.env.example](.env.example) to `.env.local` and add your keys:
   - `AI_PROVIDER` (`openai`)
   - `AI_MODEL` (`gpt-4.2`)
   - `POLYGON_API_KEY`
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `PUSHOVER_USER`
   - `PUSHOVER_TOKEN`
   - `PUSHOVER_URL`
3. Run the app:
   `yarn run dev`

## AI Service (Python 3.12+)

An initial AI service scaffold is available in [`python_ai/`](python_ai/).

1. Install Python dependencies with `uv`:
   `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv sync --extra dev`
2. Start the API:
   `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8010`
   Runtime details endpoint:
   `curl "http://127.0.0.1:8010/health/details"`
3. Run a one-shot pipeline:
   `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run python -m app.pipeline.run_once`
4. Print latest local report:
   `cd /Users/briankane/dev/antigravity/stock_trader/python_ai && uv run python -m app.reports.latest`
