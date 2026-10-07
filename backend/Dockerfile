# syntax=docker/dockerfile:1.7

# ---- build stage: compile wheels once, keep the runtime image lean ----
FROM python:3.12-slim AS builder
WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

# ---- runtime stage ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=wsgi.py \
    FORGE_ENV=production
WORKDIR /app

RUN groupadd --system forge && useradd --system --gid forge --home /app forge
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels
COPY --chown=forge:forge . .
# Generated product photos; a named volume mounted here starts with this ownership.
RUN mkdir -p /app/media && chown forge:forge /app/media

USER forge
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live', timeout=2).status == 200 else 1)"

# No gunicorn access log: the app writes one line per request with its request id (forge.access).
CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8000", "--workers", "3", "--forwarded-allow-ips", "*"]
