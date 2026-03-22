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

ENV PORT=8000
EXPOSE 8000
WORKDIR /app/python_ai

# Railway/Render set PORT; default 8000 for local docker run.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
