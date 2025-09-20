# embed_server.py
# Minimal, deterministic embedding server for local testing.
# Accepts JSON: { "image_url": "https://...",  OR  "image_base64": "<...>" }
# Returns: { "embedding": [float,...], "dim": D, "normalized": true }
#
# Config:
#   - D: vector length via env DIM or query param ?d=1024 (env takes precedence)
#   - CORS enabled for convenience

import base64
import hashlib
import os
from typing import Optional

import numpy as np
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEFAULT_D = int(os.getenv("DIM", "1024"))  # set DIM in env to override

class EmbedIn(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None

app = FastAPI(title="Local Embedding Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

def _bytes_from_input(payload: EmbedIn) -> bytes:
    if payload.image_url:
        try:
            r = requests.get(payload.image_url, timeout=15)
            r.raise_for_status()
            return r.content
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image_url: {e}")
    if payload.image_base64:
        try:
            return base64.b64decode(payload.image_base64, validate=False)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode image_base64: {e}")
    raise HTTPException(status_code=400, detail="Provide image_url OR image_base64")

def _deterministic_unit_vector(buf: bytes, D: int) -> np.ndarray:
    # Seed from sha256 of bytes → deterministic
    h = hashlib.sha256(buf).digest()
    seed = int.from_bytes(h[:8], "big", signed=False)  # 64-bit seed
    rng = np.random.default_rng(seed)
    v = rng.normal(size=D).astype(np.float32)
    # L2 normalize
    n = np.linalg.norm(v)
    if n == 0:
        v[0] = 1.0
        n = 1.0
    return (v / n).astype(np.float32)

@app.post("/embed")
async def embed(body: EmbedIn, request: Request):
    # Allow optional query param ?d=768 etc. (env DIM overrides)
    try:
        D_env = int(os.getenv("DIM", "0"))
    except Exception:
        D_env = 0
    if D_env > 0:
        D = D_env
    else:
        try:
            qd = request.query_params.get("d")
            D = int(qd) if qd else DEFAULT_D
        except Exception:
            D = DEFAULT_D

    raw = _bytes_from_input(body)
    vec = _deterministic_unit_vector(raw, D)
    return {
        "embedding": vec.tolist(),
        "dim": int(vec.shape[0]),
        "normalized": True,
    }

@app.get("/")
async def root():
    return {"ok": True, "dim_default": DEFAULT_D, "post_to": "/embed"}
