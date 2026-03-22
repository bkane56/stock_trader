# Deploy the Python AI API (FastAPI)

The UI on Vercel must call a **public HTTPS URL** for this service. You need to host `python_ai` somewhere; you do **not** need your own servers.

## Option A — Railway (good default)

1. Sign up at [railway.app](https://railway.app) (GitHub login is fine).
2. **New project** → **Deploy from GitHub repo** → pick `stock_trader` (or deploy with **Empty project** → **Dockerfile** if you prefer not to connect GitHub yet).
3. If using GitHub: set **Root Directory** to **empty** (repo root). Add a service that builds with Docker:
   - **Settings** → set **Dockerfile path** to `python_ai/Dockerfile` (path relative to repo root).
4. **Variables** tab — add the same secrets you use locally, at minimum:
   - `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` if you use Anthropic)
   - `POLYGON_API_KEY` (if you use Polygon)
   - `CORS_ALLOW_ORIGINS` — your Vercel frontend origin(s), e.g. `https://stock-trader-wine.vercel.app,http://localhost:3000`
   - Optional: `CORS_ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app` for preview URLs
5. Railway assigns a URL like `https://your-service.up.railway.app`.  
   In **Vercel**, set **`VITE_PYTHON_AI_BASE_URL`** to that URL (no trailing slash), then **redeploy** the frontend.

## Option B — Render

1. [render.com](https://render.com) → **New** → **Web Service** → connect the repo.
2. **Root directory**: leave default (repo root) or set build to use Docker.
3. **Docker**: **Dockerfile path** = `python_ai/Dockerfile`, or use their Python template with:
   - **Build**: `cd python_ai && pip install uv && uv sync --frozen --no-dev`
   - **Start**: `cd python_ai && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add the same env vars as Railway; set `VITE_PYTHON_AI_BASE_URL` on Vercel to the Render URL.

## Option C — Docker on your laptop (smoke test only)

From **repo root**:

```bash
docker build -f python_ai/Dockerfile -t stock-trader-api .
docker run --rm -p 8010:8000 -e OPENAI_API_KEY=... -e CORS_ALLOW_ORIGINS=http://localhost:3000 stock-trader-api
```

Then open `http://127.0.0.1:8010/health`.

## After deploy

1. `curl https://YOUR_API_URL/health` should return JSON with `"status":"ok"`.
2. Vercel: `VITE_PYTHON_AI_BASE_URL=https://YOUR_API_URL` → **Redeploy** the frontend.
3. API env: CORS must include your exact Vercel origin(s).

## Railway: `502` / “Application failed to respond”

That response means Railway’s proxy **did not get a healthy HTTP response** from your process (crash, wrong port, or not listening).

1. **Open logs:** Railway → your service → **Deployments** → latest deployment → **View logs**. Look for a Python traceback or “Address already in use”.
2. **Bind to `0.0.0.0` and use Railway’s `PORT`:**  
   Do **not** hardcode `8080` in the start command unless it matches what Railway sets. Prefer:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`  
   (The repo’s `python_ai/Dockerfile` already does this.)
3. **Working directory:** `uvicorn app.main:app` must run with **`python_ai` as the working directory** (or `PYTHONPATH` set), or imports fail at startup.
4. **`uvicorn: not found`:** Dependencies from `uv sync` live in `.venv`; use **`uv run uvicorn ...`** (not bare `uvicorn`). The repo Dockerfile does this. If you use a **custom start command** without Docker:  
   `cd python_ai && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Use the Dockerfile:** Settings → set **Dockerfile path** to `python_ai/Dockerfile` and build from **repo root**. If Railway auto-detected Nixpacks instead, the start command may be wrong — switch to Docker or fix the custom start command.
6. **Redeploy** after changing variables or start settings.

When fixed, `curl -sS "https://YOUR_URL.up.railway.app/health"` should return `{"status":"ok"}`.

## Notes

- **Free tiers** may sleep or rate-limit; that’s normal for side projects.
- The Dockerfile copies `.agents/skills` so the advisor skills catalog matches local behavior.
