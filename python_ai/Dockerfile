# Build from the **repository root** (not from python_ai/):
#   docker build -f python_ai/Dockerfile .
#
# Runtime layout matches local dev: repo root holds `.agents/skills` for the skills catalog.
FROM python:3.12-slim-bookworm

WORKDIR /app
RUN pip install --no-cache-dir uv

COPY python_ai/pyproject.toml python_ai/uv.lock python_ai/README.md ./python_ai/
RUN cd python_ai && uv sync --frozen --no-dev

COPY python_ai/ ./python_ai/
COPY .agents/ ./.agents/

# Do not set ENV PORT here — Railway routes to the port in Networking (often 8080).
# If we baked PORT=8000, some setups still forwarded 8080 → "connection dial timeout".
WORKDIR /app/python_ai

# `uv sync` installs deps into `.venv`; bare `uvicorn` is not on global PATH.
# Default 8080 matches Railway's public port when $PORT is unset; Railway usually injects PORT.
EXPOSE 8080
CMD ["sh", "-c", "exec /app/python_ai/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
