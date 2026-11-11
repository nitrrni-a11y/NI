FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python AI dependencies
COPY ai/requirements.txt ./ai/requirements.txt
RUN pip install --no-cache-dir -r ./ai/requirements.txt

# Install Node.js Backend production dependencies
COPY backend/package*.json ./backend/
RUN npm --prefix ./backend ci --omit=dev

# Copy AI service and pre-download ONNX model & tokenizer before enabling offline mode
ENV HF_HOME=/app/.cache/huggingface
COPY ai ./ai
RUN cd /app/ai && python -c "from app.pipeline.embedding_utils import get_embedding_model; get_embedding_model()"

# Copy Backend service & entrypoint script
COPY backend ./backend
COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

ENV HF_HUB_OFFLINE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    AI_SERVICE_URL=http://127.0.0.1:8000 \
    PORT=10000

EXPOSE 10000

CMD ["/app/start.sh"]

