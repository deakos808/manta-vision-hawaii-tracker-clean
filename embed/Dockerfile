# File: embed/Dockerfile (place next to embed_server.py)
# CPU-only image that bakes in torchvision ResNet50 weights and runs FastAPI.

FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY . /app

# Minimal OS libs for Pillow & HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
      libjpeg62-turbo libpng16-16 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch + torchvision from the official CPU wheel index
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
      torch==2.3.1 torchvision==0.18.1 \
 && pip install --no-cache-dir \
      fastapi==0.111.0 uvicorn[standard]==0.30.1 pillow==10.3.0 numpy==1.26.4 requests==2.32.3

# Pre-fetch ResNet50 weights into the image so the server never downloads at runtime
RUN python - <<'PY'
from torchvision.models import resnet50, ResNet50_Weights
m = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
m.eval()
print("resnet50 weights cached")
PY

EXPOSE 5050
CMD ["uvicorn", "embed_server:app", "--host", "0.0.0.0", "--port", "5050"]