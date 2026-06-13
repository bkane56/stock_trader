# Deploy the Python AI API (FastAPI)

The UI on Vercel must call a **public HTTPS URL** for this service. Host `python_ai` on Render (recommended) or Railway; you do **not** need your own servers.

## Option A — Render (recommended)

The repo includes [`render.yaml`](../render.yaml) at the monorepo root for Blueprint deploys. The image is built from **`python_ai/Dockerfile`** with **repo root** as Docker context (copies `python_ai/`, `skills_index.json`, and `.cursor/skills/`).

### Free tier expectations

Render free web services **spin down after ~15 minutes of inactivity**. The first request after idle triggers a **cold start** (often 30–60+ seconds):

- First API call after idle may time out in the UI (holdings refresh uses a 35s timeout) — retry once the service wakes.
- AI briefing/research calls can feel slow on cold start.
- Upgrade to a paid plan later for always-on latency.

### Render settings checklist (required)

| Setting | Value |
|--------|--------|
| **Root Directory** | Empty (repo root). **Not** `python_ai` — the Dockerfile needs build context at the repository root. |
| **Runtime** | **Docker** |
| **Dockerfile path** | `python_ai/Dockerfile` (relative to repo root) |
| **Docker context** | `.` (repo root) |
| **Start Command** | **Leave empty** so the image `CMD` runs |
| **Plan** | **Free** (or paid for always-on) |
| **Health check path** | `/health` |

**Do not** set a bare `uvicorn app.main:app ...` start command — dependencies live in `.venv` inside the image; use `python -m uvicorn` via the Dockerfile `CMD`.

### Deploy from Git (auto-deploy on push)

1. [render.com](https://render.com) → **New** → **Blueprint** → connect GitHub repo → apply [`render.yaml`](../render.yaml).  
   Or **New** → **Web Service** → connect repo and match the checklist above.
2. **Environment** tab — add secrets (minimum):

   | Variable | Purpose |
   |----------|---------|
   | `OPENAI_API_KEY` | AI agent runtime |
   | `POLYGON_API_KEY` or Alpaca keys | Market data (match local `.env`) |
   | `MARKET_DATA_PROVIDER` | e.g. `alpaca` or `polygon` |
   | `CORS_ALLOW_ORIGINS` | Vercel prod URL + `http://localhost:3000` |
   | `CORS_ALLOW_ORIGIN_REGEX` | `https://.*\.vercel\.app` for preview deploys |
   | `APP_ENV` | `production` |
   | `API_SECRET_KEY` | Shared secret; required on `POST /recommendations`, `POST /research`, `POST /briefings/generate` |

   Copy optional vars from [`.env.example`](../.env.example) as needed.

3. Render assigns a URL like `https://stock-trader-api.onrender.com`.
4. In **Vercel**, set **`VITE_PYTHON_AI_BASE_URL`** to that URL (no trailing slash) and **`VITE_API_SECRET_KEY`** to the same value as `API_SECRET_KEY`, then **redeploy** the frontend.

**CORS example** (production frontend at `https://stock-trader-wine.vercel.app`):

```bash
CORS_ALLOW_ORIGINS=https://stock-trader-wine.vercel.app,http://localhost:3000
CORS_ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app
```

### Render: `502` / “Application failed to respond”

Same root causes as Railway — the proxy did not get a healthy HTTP response (crash, wrong port, or not listening).

1. **Logs:** Render → service → **Logs**. Look for Python tracebacks or “Address already in use”.
2. **Bind to `0.0.0.0` and use Render’s `PORT`:** The Dockerfile listens on `${PORT:-8080}`. Render sets `PORT` automatically — do not override with a mismatched value.
3. **Working directory:** `uvicorn app.main:app` runs with **`/app/python_ai`** as cwd (set in Dockerfile).
4. **`uvicorn: not found`:** Use the Dockerfile `CMD` (`.venv/bin/python -m uvicorn ...`). Clear any custom start command that only says `uvicorn ...`.
5. **Redeploy** after changing variables or start settings.

When fixed:

```bash
curl -sS "https://YOUR-SERVICE.onrender.com/health"
# {"status":"ok"}
```

## Option B — Railway

The repo includes **`railway.json` at the monorepo root** so Railway uses **Docker** and **`python_ai/Dockerfile`**, not Railpack/Nixpacks.

### Railway settings checklist

| Setting | Value |
|--------|--------|
| **Root Directory** | Empty (repo root) |
| **Builder** | **Dockerfile** |
| **Dockerfile path** | `python_ai/Dockerfile` |
| **Start Command** | **Leave empty** or use `railway.json` `deploy.startCommand` |

See Railway variables and troubleshooting in git history or Railway docs; CORS and Vercel wiring are identical to Render.

## Option C — Docker on your laptop (smoke test only)

From **repo root**:

```bash
docker build -f python_ai/Dockerfile -t stock-trader-api .
docker run --rm -p 8010:8080 -e OPENAI_API_KEY=... -e CORS_ALLOW_ORIGINS=http://localhost:3000 stock-trader-api
```

Then open `http://127.0.0.1:8010/health`.

Or run the automated check:

```bash
./python_ai/scripts/verify_docker_image.sh
```

## After deploy (Vercel + API)

Wire in this order:

1. Deploy API on Render → copy HTTPS URL.
2. Vercel: set `VITE_PYTHON_AI_BASE_URL` → **Redeploy** frontend (value is baked in at build time).
3. Render: add Vercel production URL to `CORS_ALLOW_ORIGINS` if not already listed.
4. Smoke test: `curl https://YOUR_API_URL/health` and open the app (no CORS errors in DevTools).

```bash
curl -sS https://YOUR_API_URL/health
curl -sS -H "Origin: https://your-app.vercel.app" https://YOUR_API_URL/health
```

## Notes

- **Free tiers** may sleep or rate-limit; that is normal for side projects.
- The Dockerfile copies `skills_index.json` and `.cursor/skills/` so the advisor skills catalog matches local behavior.
- API artifacts (`python_ai/artifacts/`, decision ledger) are **ephemeral** on Render unless you add persistent disk later.
