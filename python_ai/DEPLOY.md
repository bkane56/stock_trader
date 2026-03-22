# Deploy the Python AI API (FastAPI)

The UI on Vercel must call a **public HTTPS URL** for this service. You need to host `python_ai` somewhere; you do **not** need your own servers.

## Option A — Railway (good default)

The repo includes **`railway.json` at the monorepo root** so Railway uses **Docker** and **`python_ai/Dockerfile`**, not Railpack/Nixpacks (which often produce a bad start command for this app).

1. Sign up at [railway.app](https://railway.app) (GitHub login is fine).
2. **New project** → **Deploy from GitHub repo** → pick `stock_trader` (or deploy with **Empty project** → **Dockerfile** if you prefer not to connect GitHub yet).
3. If using GitHub: set **Root Directory** to **empty** (repo root). Do **not** set it to `python_ai` — the Dockerfile’s `COPY python_ai/` and `COPY .agents/` lines assume the build context is the **repository root**. Add a service that builds with Docker:
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
docker run --rm -p 8010:8080 -e OPENAI_API_KEY=... -e CORS_ALLOW_ORIGINS=http://localhost:3000 stock-trader-api
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
   Use `$PORT` (Railway sets it, often `8080`). The repo `python_ai/Dockerfile` listens on `${PORT:-8080}` so it matches **Networking → port 8080** if `PORT` is missing.
3. **Working directory:** `uvicorn app.main:app` must run with **`python_ai` as the working directory** (or `PYTHONPATH` set), or imports fail at startup.
4. **`uvicorn: not found`:** Dependencies from `uv sync` live in `.venv`; **bare `uvicorn` is not on `PATH`**. The Dockerfile uses  
   `/app/python_ai/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`.  
   If Railway **isn’t using the Dockerfile**, set the start command to that (or `cd python_ai && .venv/bin/python -m uvicorn ...` after a build that creates `.venv`). **Turn off** any custom command that only says `uvicorn ...`.
5. **Use the Dockerfile:** Settings → set **Dockerfile path** to `python_ai/Dockerfile` and build from **repo root**. If Railway auto-detected Nixpacks instead, the start command may be wrong — switch to Docker or fix the custom start command.
6. **Redeploy** after changing variables or start settings.

When fixed, `curl -sS "https://YOUR_URL.up.railway.app/health"` should return `{"status":"ok"}`.

## Railway: `502` + `connection dial timeout`

Railway’s proxy **could not open TCP** to your container (often **wrong port**).

1. **Networking** tab: note the port (e.g. **8080**). The app must listen on **that same port**.
2. In **Variables**, add **`PORT=8080`** (match the Networking port) and redeploy.
3. **Do not** bake a different `ENV PORT` in the image than the public port — the Dockerfile avoids that; defaults to **8080** when unset.
4. **Logs:** confirm a line like `Uvicorn running on http://0.0.0.0:8080` (or your `PORT`). If the process exits before that, fix the traceback first.

## Notes

- **Free tiers** may sleep or rate-limit; that’s normal for side projects.
- The Dockerfile copies `.agents/skills` so the advisor skills catalog matches local behavior.
