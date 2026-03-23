FROM python:3.12-slim-bookworm

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY python_ai/ /app/python_ai/
COPY .agents/ /app/.agents/

WORKDIR /app/python_ai

RUN uv sync --frozen --no-dev

ENV PATH="/app/python_ai/.venv/bin:$PATH"

EXPOSE 8080

CMD ["sh", "-c", "exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]