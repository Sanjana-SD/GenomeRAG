# GenomeRAG: single container serving the API and the built React UI on port 8000.
#   docker build -t genomerag .
#   docker run --env-file .env -p 8000:8000 genomerag

# ---- 1. build the frontend -------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python runtime -----------------------------------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface
WORKDIR /app

COPY requirements.txt ./
# CPU-only PyTorch keeps the image ~2 GB smaller than the default CUDA build.
RUN pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements.txt

# Bake the embedding model into the image so the first request is not a download.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY agent ./agent
COPY api ./api
COPY evolution ./evolution
COPY genome ./genome
COPY scripts ./scripts
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Local persistence fallback (only used when Supabase is unavailable). Mount a volume to keep it.
RUN mkdir -p /app/data && useradd --create-home app && chown -R app /app
USER app
VOLUME ["/app/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=8)"
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
