# File: embed/embed_server.py (place next to Dockerfile)
# FastAPI embedding server using torchvision ResNet50 features (2048D)
# projected to DIM (default 1024) via a fixed, deterministic random matrix.
# Endpoints:
#   GET  /health -> { ok, has_model, model, dim }
#   POST /embed  -> { embedding[], dim, normalized, norm, bytes_sha256, mode }

import base64
import hashlib
import io
import os
from typing import Optional

import numpy as np
import requests
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from torchvision.models import resnet50, ResNet50_Weights

# --- Config ---
DIM = int(os.getenv("DIM", "1024"))
if DIM <= 0 or DIM > 2048:
    DIM = 1024
MODEL_NAME = "resnet50"

# --- App ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Globals ---
_feature_net: Optional[nn.Module] = None
_proj: Optional[np.ndarray] = None
_transform = None
_HAS_MODEL = False

class EmbedRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None


def _lazy_init():
    global _feature_net, _proj, _transform, _HAS_MODEL
    if _feature_net is not None:
        return
    # Load ResNet50 with ImageNet weights (already cached in Docker image)
    weights = ResNet50_Weights.IMAGENET1K_V2
    model = resnet50(weights=weights)
    # Chop off the classifier to get a 2048-dim pooled feature vector
    _feature_net = nn.Sequential(*list(model.children())[:-1])  # -> (B,2048,1,1)
    _feature_net.eval()

    # Deterministic random projection 2048 -> DIM
    rng = np.random.default_rng(123456789)
    _proj = rng.normal(0.0, 1.0 / np.sqrt(2048), size=(2048, DIM)).astype(np.float32)

    # Image preprocessing pipeline (Resize+CenterCrop+ToTensor+Normalize)
    _transform = weights.transforms()

    _HAS_MODEL = True


@app.get("/health")
def health():
    return {"ok": True, "has_model": bool(_HAS_MODEL), "model": MODEL_NAME, "dim": int(DIM)}


def _load_image_bytes(req: EmbedRequest) -> bytes:
    if req.image_url:
        try:
            r = requests.get(req.image_url, timeout=30)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"failed to fetch image_url: {e}")
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail=f"failed to fetch image_url: HTTP {r.status_code}")
        return r.content
    if req.image_base64:
        try:
            return base64.b64decode(req.image_base64, validate=True)
        except Exception:
            try:
                return base64.b64decode(req.image_base64)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"invalid base64: {e}")
    raise HTTPException(status_code=400, detail="Provide image_url or image_base64")


@app.post("/embed")
def embed(req: EmbedRequest):
    _lazy_init()

    img_bytes = _load_image_bytes(req)
    digest = hashlib.sha256(img_bytes).hexdigest()

    # Open image
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"cannot open image: {e}")

    # Preprocess
    x = _transform(img).unsqueeze(0)  # (1,3,224,224)

    # Extract 2048-d features
    with torch.no_grad():
        feats = _feature_net(x)  # (1,2048,1,1)
    v2048 = feats.view(-1).cpu().numpy()  # (2048,)

    # Project to DIM and L2-normalize
    v = v2048 @ _proj  # (DIM,)
    norm = float(np.linalg.norm(v))
    if norm > 0:
        v = v / norm

    return {
        "embedding": [float(f) for f in v.tolist()],
        "dim": int(DIM),
        "normalized": True,
        "norm": float(np.linalg.norm(v)),
        "bytes_sha256": digest,
        "mode": "resnet50_rp",
    }


@app.get("/")
def root():
    return {"ok": True, "message": "manta embed server"}