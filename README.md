
## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `yarn install`
2. Copy [.env.example](.env.example) to `.env.local` and add your keys:
   - `VITE_INSTANTDB_APP_ID`
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

## Vercel Deployment (Dev First)

This repo is configured for Vercel with:
- `vercel.json` for Vite + SPA routing.
- npm scripts for local Vercel dev, preview deploys, and production deploys.

### 0) Confirm the CLI is logged in

After `vercel login`, this must print your Vercel email (not an error):

```bash
npx vercel@48.6.0 whoami
```

If you see **“No existing credentials”**, the browser login did not save a token for this CLI (or you used a different machine). Fix it with either:

- Run `npx vercel@48.6.0 login` again in **your normal terminal** (same user account as this repo), then re-check `whoami`, **or**
- Create a token at [Vercel → Account → Tokens](https://vercel.com/account/tokens), then run commands with it (do not commit the token):

```bash
export VERCEL_TOKEN="vercel_token_..."   # session-only; use your shell profile for persistence if desired
npx vercel@48.6.0 whoami
```

### 1) Link the repo to a Vercel project (one-time)

Creates `.vercel/project.json` (gitignored). Use a project name you want on Vercel (example: `stock-trader`):

```bash
npx vercel@48.6.0 link --yes -p stock-trader
```

Interactive alternative (pick team/project in prompts):

```bash
npx vercel@48.6.0 link
```

### 2) Run Vercel locally first

```bash
yarn vercel:dev
```

Notes:
- Keep the Python API running locally on `http://127.0.0.1:8010` for full features.
- Frontend API calls use `VITE_PYTHON_AI_BASE_URL` (defaults to `http://127.0.0.1:8010`).

### 3) Deploy preview (dev/staging)

```bash
yarn vercel:preview
```

This runs `vercel deploy` **without** `--prod`, so it is a **Preview** deployment (uses **Preview** env vars in the dashboard). The script also passes **`--skip-domain`** so Vercel does **not** auto-assign your production domain / alias to this deploy — you get a normal preview URL.

**Why the CLI says “Production”:** Vercel’s output is easy to misread. A line like `Production: https://…vercel.app` often means “here is the main URL for this deployment,” **not** “this used Production environment variables.” Only `vercel deploy --prod` (see below) is a **production** deploy and uses **Production** env vars. Open the **Inspect** link in the CLI output to confirm *Preview* vs *Production* in the dashboard.

### 4) Deploy production

```bash
yarn vercel:prod
```

This is `vercel deploy --prod` — promotes to production and uses **Production** env vars.

### Recommended Vercel Environment Variables

Set these in Vercel for Preview and Production as needed:
- `VITE_INSTANTDB_APP_ID`
- `VITE_PYTHON_AI_BASE_URL` — **HTTPS URL of your deployed Python API** (e.g. `https://stock-trader-api.fly.dev`).  
  **Do not** use `http://127.0.0.1:8010` here: in the browser that means “the visitor’s own computer,” not your server, so requests fail or hit CORS.

On the **deployed Python service**, allow your Vercel origins via `CORS_ALLOW_ORIGINS` (production URL) and optionally `CORS_ALLOW_ORIGIN_REGEX` for all `*.vercel.app` previews — see [`python_ai/README.md`](python_ai/README.md#cors-and-the-vercel-frontend).

**If the live site still calls `http://127.0.0.1:8010`:** the bundle was built without `VITE_PYTHON_AI_BASE_URL`. Common causes: (1) the variable is only set for **Production** but you’re on a **Preview** URL — add the same variable under **Preview** in Vercel; (2) you didn’t **Redeploy** after saving env; (3) typo in the name (`VITE_PYTHON_AI_BASE_URL`). After fixing, the build should fail on Vercel if the var is still missing (`VERCEL=1`).

## InstantDB Setup

Frontend portfolio persistence and authentication use InstantDB.

- Website configuration guide: [`INSTANTDB_SETUP.md`](INSTANTDB_SETUP.md)
- Schema + perms files: [`instant.schema.ts`](instant.schema.ts), [`instant.perms.ts`](instant.perms.ts)
- Uses magic-code authentication by default.
- Persists users, portfolios, positions, and portfolio events.
- Computes `totalValue` and `investedAmount` from position data in phase 1.

## AI Service (Python 3.12+)

An initial AI service scaffold is available in [`python_ai/`](python_ai/).

**Deploy the API** (Railway, Render, etc.) so Vercel can call it over HTTPS: see [`python_ai/DEPLOY.md`](python_ai/DEPLOY.md).

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
