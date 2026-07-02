#!/usr/bin/env python3
"""
Deterministic manta ventral pigment-region matcher.

This module deliberately avoids feature/keypoint detectors that tend to lock on
edge halos, background texture, and gill-slit lines. It segments a hard body
mask, defines a conservative central ventral ROI, extracts dark connected
pigment regions, and scores region geometry plus pigment-mask overlap.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import itertools
import json
import math
import os
import zlib
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


DEFAULT_LONG_EDGE = 900
MATCHER_MODE = os.environ.get("MANTA_MATCHER_MODE", "normal").strip().lower()
if MATCHER_MODE not in {"normal", "enhanced"}:
    MATCHER_MODE = "normal"
AUTO_ORIENT = os.environ.get("MANTA_AUTO_ORIENT", "0").strip().lower() in {"1", "true", "yes", "on"}
ORIENTATION_MODE = "auto_orient" if AUTO_ORIENT else "curated_orientation"
ADAPTIVE_ENHANCE = os.environ.get("MANTA_ADAPTIVE_ENHANCE", "1").strip().lower() not in {"0", "false", "no", "off"}
ENHANCE_MODE = "adaptive_enhance" if ADAPTIVE_ENHANCE and MATCHER_MODE == "normal" else f"{MATCHER_MODE}_enhance"
ENABLE_AFFINE_RESCUE = os.environ.get("MANTA_ENABLE_AFFINE_RESCUE", "0").strip().lower() in {"1", "true", "yes", "on"}
SIGNATURE_VERSION = f"pigment_regions_v31_orientation_normalized_regions_{ENHANCE_MODE}_{ORIENTATION_MODE}"
EPS = 1e-9
TRI_ZONES = ("gill_chest", "central_belly", "pelvic_belly")
ZONE_IMPORTANCE = {
    "gill_chest": 1.25,
    "central_belly": 1.12,
    "pelvic_belly": 1.18,
}
DEFAULT_PRIOR_PATH = Path(__file__).with_name("pigment_region_priors.json")


@dataclass
class Region:
    id: int
    centroid: tuple[float, float]
    centroid_norm: tuple[float, float]
    area: int
    area_norm: float
    bbox: tuple[int, int, int, int]
    radius: float
    aspect: float
    eccentricity: float
    mean_darkness: float
    contrast: float
    weight: float
    zone: str
    contour: list[tuple[int, int]]


@dataclass
class RejectedRegion:
    reason: str
    centroid: tuple[float, float]
    centroid_norm: tuple[float, float]
    area: int
    bbox: tuple[int, int, int, int]
    aspect: float
    eccentricity: float
    line_score: float
    zone: str


@dataclass
class ProcessedImage:
    path: str
    image: np.ndarray
    gray: np.ndarray
    body_mask: np.ndarray
    body_inner_mask: np.ndarray
    roi: tuple[int, int, int, int]
    roi_mask: np.ndarray
    pigment_mask: np.ndarray
    spotness: np.ndarray
    regions: list[Region]
    support_regions: list[Region]
    metrics: dict[str, Any]
    rejected_regions: list[RejectedRegion]


@dataclass
class PhotoSignatureRef:
    catalog_id: str
    photo_id: str
    image_path: str
    label: str = ""


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def encode_mask(mask: np.ndarray) -> dict[str, Any]:
    packed = np.packbits(mask.astype(np.uint8).reshape(-1))
    compressed = zlib.compress(packed.tobytes(), level=6)
    return {
        "shape": [int(mask.shape[0]), int(mask.shape[1])],
        "bit_count": int(mask.size),
        "encoding": "packbits+zlib+base64",
        "data": base64.b64encode(compressed).decode("ascii"),
    }


def decode_mask(payload: dict[str, Any]) -> np.ndarray:
    shape = payload.get("shape") or [1, 1]
    bit_count = int(payload.get("bit_count") or (int(shape[0]) * int(shape[1])))
    raw = zlib.decompress(base64.b64decode(payload["data"]))
    unpacked = np.unpackbits(np.frombuffer(raw, dtype=np.uint8), count=bit_count)
    return unpacked.reshape((int(shape[0]), int(shape[1]))).astype(bool)


def region_from_dict(row: dict[str, Any]) -> Region:
    return Region(
        id=int(row["id"]),
        centroid=tuple(row["centroid"]),  # type: ignore[arg-type]
        centroid_norm=tuple(row["centroid_norm"]),  # type: ignore[arg-type]
        area=int(row["area"]),
        area_norm=float(row["area_norm"]),
        bbox=tuple(row["bbox"]),  # type: ignore[arg-type]
        radius=float(row["radius"]),
        aspect=float(row["aspect"]),
        eccentricity=float(row["eccentricity"]),
        mean_darkness=float(row["mean_darkness"]),
        contrast=float(row["contrast"]),
        weight=float(row["weight"]),
        zone=str(row["zone"]),
        contour=[tuple(p) for p in row.get("contour", [])],  # type: ignore[list-item]
    )


def processed_to_signature(
    proc: ProcessedImage,
    catalog_id: str = "",
    photo_id: str = "",
    label: str = "",
    long_edge: int = DEFAULT_LONG_EDGE,
) -> dict[str, Any]:
    return {
        "signature_version": SIGNATURE_VERSION,
        "catalog_id": str(catalog_id),
        "photo_id": str(photo_id),
        "label": str(label),
        "image_path": proc.path,
        "long_edge": int(long_edge),
        "image_shape": [int(proc.image.shape[0]), int(proc.image.shape[1])],
        "roi": list(proc.roi),
        "metrics": proc.metrics,
        "regions": [asdict(r) for r in proc.regions],
        "support_regions": [asdict(r) for r in proc.support_regions],
        "pigment_mask": encode_mask(proc.pigment_mask),
    }


def processed_from_signature(signature: dict[str, Any]) -> ProcessedImage:
    pigment_mask = decode_mask(signature["pigment_mask"])
    h, w = pigment_mask.shape
    image = np.zeros((h, w, 3), dtype=np.uint8)
    gray = np.zeros((h, w), dtype=np.float32)
    body = np.ones((h, w), dtype=bool)
    roi = tuple(signature.get("roi") or (0, 0, w, h))  # type: ignore[assignment]
    roi_mask = np.zeros((h, w), dtype=bool)
    x0, y0, x1, y1 = roi
    roi_mask[int(y0) : int(y1), int(x0) : int(x1)] = True
    return ProcessedImage(
        path=str(signature.get("image_path", "")),
        image=image,
        gray=gray,
        body_mask=body,
        body_inner_mask=body,
        roi=(int(x0), int(y0), int(x1), int(y1)),
        roi_mask=roi_mask,
        pigment_mask=pigment_mask,
        spotness=gray,
        regions=[region_from_dict(r) for r in signature.get("regions", [])],
        support_regions=[region_from_dict(r) for r in signature.get("support_regions", [])],
        metrics=dict(signature.get("metrics", {})),
        rejected_regions=[],
    )


def signature_cache_path(cache_dir: str | Path, photo_id: str, image_path: str | Path = "") -> Path:
    safe_photo_id = str(photo_id or "").strip()
    if not safe_photo_id:
        safe_photo_id = "path_" + hashlib.sha1(str(image_path).encode("utf-8")).hexdigest()[:16]
    return Path(cache_dir) / f"{safe_photo_id}.json"


def load_or_create_signature(
    ref: dict[str, Any],
    cache_dir: str | Path,
    long_edge: int = DEFAULT_LONG_EDGE,
    refresh: bool = False,
) -> tuple[ProcessedImage, dict[str, Any], bool]:
    photo_id = str(ref.get("photo_id") or ref.get("pk_photo_id") or "")
    path = str(ref.get("image_path") or ref.get("path") or "")
    cache_path = signature_cache_path(cache_dir, photo_id, path)
    if cache_path.exists() and not refresh:
        signature = json.loads(cache_path.read_text(encoding="utf-8"))
        if signature.get("signature_version") == SIGNATURE_VERSION and int(signature.get("long_edge") or 0) == int(long_edge):
            return processed_from_signature(signature), signature, True

    proc = process_image(path, long_edge, enhance=(MATCHER_MODE == "enhanced"))
    signature = processed_to_signature(
        proc,
        catalog_id=str(ref.get("catalog_id") or ref.get("fk_catalog_id") or ""),
        photo_id=photo_id,
        label=str(ref.get("label") or ref.get("output_filename") or Path(path).name),
        long_edge=long_edge,
    )
    ensure_dir(cache_path.parent)
    cache_path.write_text(json.dumps(signature, indent=2), encoding="utf-8")
    return proc, signature, False


def load_rgb(path: str | Path, long_edge: int = DEFAULT_LONG_EDGE) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = long_edge / max(w, h)
    if scale != 1.0:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    return np.asarray(img).astype(np.uint8)


def rgb_to_gray(rgb: np.ndarray) -> np.ndarray:
    arr = rgb.astype(np.float32)
    return 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]


def robust_rescale(values: np.ndarray, p_low: float = 2.0, p_high: float = 98.0) -> np.ndarray:
    if values.size == 0:
        return values.astype(np.float32)
    lo = float(np.percentile(values, p_low))
    hi = float(np.percentile(values, p_high))
    if hi <= lo + EPS:
        return np.zeros_like(values, dtype=np.float32)
    return np.clip((values.astype(np.float32) - lo) / (hi - lo), 0.0, 1.0)


def enhanced_pigment_gray(gray: np.ndarray, body: np.ndarray, roi: tuple[int, int, int, int]) -> tuple[np.ndarray, dict[str, Any]]:
    """Deterministically enhance dark pigment patches before segmentation.

    This is the automated version of "make the spots more obvious": correct
    broad illumination, emphasize dark local deviations, and avoid sharpening
    halos. The output is still a grayscale image, so every downstream step
    remains inspectable and deterministic.
    """
    h, w = gray.shape
    x0, y0, x1, y1 = roi
    roi_mask = np.zeros_like(body, dtype=bool)
    roi_mask[y0:y1, x0:x1] = True
    valid = body & roi_mask
    if int(valid.sum()) < 200:
        return gray.astype(np.float32), {"enhancement_method": "skipped_empty_valid_roi"}

    large_bg = box_blur(gray, max(19, round(max(h, w) * 0.070)))
    medium_bg = box_blur(gray, max(11, round(max(h, w) * 0.030)))
    dark_large = np.clip(large_bg - gray, 0, 255)
    dark_medium = np.clip(medium_bg - gray, 0, 255)
    dark_response = np.maximum(dark_large * 0.72, dark_medium)

    response_norm = np.zeros_like(gray, dtype=np.float32)
    response_norm[valid] = robust_rescale(dark_response[valid], 5.0, 99.0)

    illum_corrected = gray - large_bg + float(np.median(gray[valid]))
    illum_norm = np.zeros_like(gray, dtype=np.float32)
    illum_norm[valid] = robust_rescale(illum_corrected[valid], 2.0, 98.0)

    # Dark pigment should become darker in the enhanced gray image, while the
    # surrounding ventral surface is normalized to a stable mid/bright range.
    enhanced = np.clip(235.0 * illum_norm - 92.0 * response_norm + 18.0, 0, 255)
    out = gray.astype(np.float32).copy()
    out[valid] = enhanced[valid]
    return out, {
        "enhancement_method": "multiscale_dark_pigment_response",
        "enhancement_valid_px": int(valid.sum()),
        "enhancement_dark_response_p95": float(np.percentile(dark_response[valid], 95)),
        "enhancement_dark_response_p99": float(np.percentile(dark_response[valid], 99)),
        "enhancement_gray_before_p50": float(np.percentile(gray[valid], 50)),
        "enhancement_gray_after_p50": float(np.percentile(out[valid], 50)),
    }


def saturation(rgb: np.ndarray) -> np.ndarray:
    arr = rgb.astype(np.float32) / 255.0
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    return (mx - mn) / np.maximum(mx, EPS)


def box_blur(a: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return a.astype(np.float32)
    a = a.astype(np.float32)
    pad = radius
    padded = np.pad(a, ((pad, pad), (pad, pad)), mode="reflect")
    integral = padded.cumsum(axis=0).cumsum(axis=1)
    h, w = a.shape
    y0 = np.arange(h)
    y1 = y0 + 2 * radius
    x0 = np.arange(w)
    x1 = x0 + 2 * radius
    total = (
        integral[y1[:, None], x1[None, :]]
        - np.where(y0[:, None] > 0, integral[y0[:, None] - 1, x1[None, :]], 0)
        - np.where(x0[None, :] > 0, integral[y1[:, None], x0[None, :] - 1], 0)
        + np.where((y0[:, None] > 0) & (x0[None, :] > 0), integral[y0[:, None] - 1, x0[None, :] - 1], 0)
    )
    return total / float((2 * radius + 1) ** 2)


def morph(mask: np.ndarray, radius: int, op: str) -> np.ndarray:
    if radius <= 0:
        return mask.astype(bool)
    src = mask.astype(np.uint8)
    padded = np.pad(src, ((radius, radius), (radius, radius)), mode="constant")
    h, w = src.shape
    out = np.zeros((h, w), dtype=bool) if op == "dilate" else np.ones((h, w), dtype=bool)
    for dy in range(2 * radius + 1):
        for dx in range(2 * radius + 1):
            view = padded[dy : dy + h, dx : dx + w].astype(bool)
            if op == "dilate":
                out |= view
            elif op == "erode":
                out &= view
            else:
                raise ValueError(op)
    return out


def open_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    return morph(morph(mask, radius, "erode"), radius, "dilate")


def close_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    return morph(morph(mask, radius, "dilate"), radius, "erode")


def connected_components(mask: np.ndarray) -> list[dict[str, Any]]:
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    comps: list[dict[str, Any]] = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        pts: list[tuple[int, int]] = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if ny == y and nx == x:
                        continue
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        arr = np.array(pts, dtype=np.int32)
        comps.append(
            {
                "points": arr,
                "area": int(len(pts)),
                "bbox": (
                    int(arr[:, 1].min()),
                    int(arr[:, 0].min()),
                    int(arr[:, 1].max()) + 1,
                    int(arr[:, 0].max()) + 1,
                ),
            }
        )
    return comps


def largest_component(mask: np.ndarray, prefer_center: bool = True) -> np.ndarray:
    comps = connected_components(mask)
    if not comps:
        return np.zeros_like(mask, dtype=bool)
    h, w = mask.shape
    cx, cy = w / 2.0, h / 2.0
    best = None
    best_score = -1.0
    for comp in comps:
        pts = comp["points"]
        px = float(pts[:, 1].mean())
        py = float(pts[:, 0].mean())
        center_bonus = 1.0
        if prefer_center:
            dist = math.hypot((px - cx) / max(w, 1), (py - cy) / max(h, 1))
            center_bonus = max(0.25, 1.0 - dist)
        score = comp["area"] * center_bonus
        if score > best_score:
            best = comp
            best_score = score
    out = np.zeros_like(mask, dtype=bool)
    if best is not None:
        pts = best["points"]
        out[pts[:, 0], pts[:, 1]] = True
    return out


def fill_holes(mask: np.ndarray) -> np.ndarray:
    inv = ~mask
    h, w = mask.shape
    border = np.zeros_like(mask, dtype=bool)
    border[0, :] = inv[0, :]
    border[-1, :] = inv[-1, :]
    border[:, 0] = inv[:, 0]
    border[:, -1] = inv[:, -1]
    outside = np.zeros_like(mask, dtype=bool)
    stack = list(zip(*np.nonzero(border)))
    for y, x in stack:
        outside[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and inv[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    return mask | (inv & ~outside)


def mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return (0, 0, mask.shape[1], mask.shape[0])
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def mask_border_touch_fraction(mask: np.ndarray) -> float:
    if int(mask.sum()) <= 0:
        return 1.0
    border_px = int(mask[0, :].sum() + mask[-1, :].sum() + mask[:, 0].sum() + mask[:, -1].sum())
    return float(border_px / max(1, int(mask.sum())))


def straight_boundary_fraction(mask: np.ndarray, min_run: int = 28) -> float:
    """Estimate how much of a mask boundary is suspiciously straight.

    Long horizontal/vertical/diagonal runs usually come from photo crop edges or
    rotation padding, not manta anatomy. This is a conservative geometry check:
    it does not remove anything by itself, it only lets the selector penalize
    masks whose boundary is dominated by artificial straight lines.
    """
    if int(mask.sum()) <= 0:
        return 1.0
    boundary = mask & ~morph(mask, 1, "erode")
    total = int(boundary.sum())
    if total <= 0:
        return 1.0

    def count_long_runs(arr: np.ndarray) -> int:
        count = 0
        for row in arr:
            run = 0
            for val in row.tolist():
                if val:
                    run += 1
                else:
                    if run >= min_run:
                        count += run
                    run = 0
            if run >= min_run:
                count += run
        return count

    long_px = count_long_runs(boundary)
    long_px += count_long_runs(boundary.T)
    h, w = boundary.shape
    diag_px = 0
    for offset in range(-h + 1, w):
        diag = np.diagonal(boundary, offset=offset)
        diag_px += count_long_runs(diag.reshape(1, -1))
    flipped = np.fliplr(boundary)
    for offset in range(-h + 1, w):
        diag = np.diagonal(flipped, offset=offset)
        diag_px += count_long_runs(diag.reshape(1, -1))
    long_px += diag_px
    return float(min(1.0, long_px / max(1, total)))


def body_shape_metrics(mask: np.ndarray, valid_area: np.ndarray | None = None) -> dict[str, float]:
    if int(mask.sum()) <= 0:
        return {
            "shape_score": -1.0,
            "shape_extent": 1.0,
            "shape_width_variation": 0.0,
            "shape_taper_score": 0.0,
            "shape_straight_boundary_fraction": 1.0,
        }
    if valid_area is None:
        valid_area = np.ones_like(mask, dtype=bool)
    x0, y0, x1, y1 = mask_bbox(mask)
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    area = float(mask.sum())
    extent = float(area / max(1, bw * bh))
    crop = mask[y0:y1, x0:x1]
    row_widths = crop.sum(axis=1).astype(np.float32) / float(bw)
    active = row_widths[row_widths > 0.01]
    if active.size == 0:
        width_variation = 0.0
        taper_score = 0.0
    else:
        width_variation = float(np.std(active) / (np.mean(active) + EPS))
        top_n = max(1, int(round(active.size * 0.18)))
        bottom_n = max(1, int(round(active.size * 0.18)))
        mid0 = max(0, int(round(active.size * 0.34)))
        mid1 = max(mid0 + 1, int(round(active.size * 0.72)))
        max_mid = float(np.max(active[mid0:mid1]))
        end_width = float(min(np.median(active[:top_n]), np.median(active[-bottom_n:])))
        taper_score = float(np.clip((max_mid - end_width) / max(max_mid, EPS), 0.0, 1.0))
    straight = straight_boundary_fraction(mask)
    valid_coverage = float(mask.sum() / max(1, int(valid_area.sum())))
    # Manta bodies are broad but tapered and irregular. Ellipses/photo tiles tend
    # to have high extent, low taper, or long straight boundaries.
    extent_score = 1.0 - min(1.0, abs(extent - 0.56) / 0.32)
    variation_score = min(1.0, width_variation / 0.42)
    score = 1.05 * extent_score + 0.85 * taper_score + 0.55 * variation_score - 1.25 * straight
    if valid_coverage > 0.88:
        score -= 2.0
    elif valid_coverage > 0.72:
        score -= 0.8
    if extent > 0.82:
        score -= 0.9
    return {
        "shape_score": float(score),
        "shape_extent": extent,
        "shape_width_variation": width_variation,
        "shape_taper_score": taper_score,
        "shape_straight_boundary_fraction": straight,
        "shape_valid_area_coverage": valid_coverage,
    }


def valid_photo_area_mask(rgb: np.ndarray, gray: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Detect blank rotation padding so it cannot become the segmented subject."""
    h, w = gray.shape
    sat = saturation(rgb)
    # The exported head-up rotations commonly fill corners with near-black
    # pixels. Treat only border-connected flat padding as invalid; interior dark
    # manta pigment is never removed by this flood.
    dark_padding = (gray <= 7.0) & (sat <= 0.06)
    light_padding = (gray >= 248.0) & (sat <= 0.035)
    padding_seed = dark_padding | light_padding
    padding = flood_from_border(padding_seed)
    padding = morph(padding, 1, "dilate")
    valid = ~padding
    # Avoid pathological all-padding/all-valid results.
    invalid_fraction = float(padding.mean())
    if invalid_fraction > 0.72:
        valid = np.ones((h, w), dtype=bool)
        padding = ~valid
        invalid_fraction = 0.0
    vx0, vy0, vx1, vy1 = mask_bbox(valid)
    return valid.astype(bool), {
        "valid_photo_area_fraction": float(valid.mean()),
        "padding_area_fraction": invalid_fraction,
        "padding_area_px": int(padding.sum()),
        "valid_photo_bbox": [vx0, vy0, vx1, vy1],
    }


def rgb_with_padding_neutralized(rgb: np.ndarray, valid_area: np.ndarray) -> np.ndarray:
    if int((~valid_area).sum()) == 0:
        return rgb
    out = rgb.copy()
    inner_valid = valid_area & ~morph(~valid_area, 3, "dilate")
    sample = rgb[inner_valid]
    if sample.size == 0:
        sample = rgb[valid_area]
    if sample.size == 0:
        fill = np.array([0, 0, 0], dtype=np.uint8)
    else:
        fill = np.median(sample.reshape(-1, 3), axis=0).astype(np.uint8)
    out[~valid_area] = fill
    return out


@lru_cache(maxsize=2)
def rembg_session(model_name: str = "u2net") -> Any:
    from rembg import new_session

    return new_session(model_name)


def segment_body_with_rembg(
    rgb: np.ndarray,
    ellipse: np.ndarray,
    model_name: str,
    valid_area: np.ndarray | None = None,
    neutralize_padding: bool = True,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Local subject segmentation using a deterministic on-disk rembg/U2Net model.

    This is still a local pipeline: rembg loads an ONNX model from disk and does
    not call a cloud API. The confidence gate is intentionally conservative
    because occasional failures return a rotated photo rectangle instead of the
    manta body.
    """
    h, w = rgb.shape[:2]
    if valid_area is None:
        valid_area = np.ones((h, w), dtype=bool)
    prefix = model_name.replace("-", "_")
    metrics: dict[str, Any] = {
        f"{prefix}_available": False,
        f"{prefix}_accepted": False,
    }
    try:
        from rembg import remove
    except Exception as exc:
        metrics[f"{prefix}_failure"] = f"import_failed:{type(exc).__name__}"
        return np.zeros((h, w), dtype=bool), metrics

    try:
        session = rembg_session(model_name)
        seg_rgb = rgb_with_padding_neutralized(rgb, valid_area) if neutralize_padding else rgb
        img = Image.fromarray(seg_rgb).convert("RGB")
        out = remove(img, session=session, only_mask=True)
        alpha = np.asarray(out.convert("L")).astype(np.uint8)
    except Exception as exc:
        metrics[f"{prefix}_failure"] = f"segment_failed:{type(exc).__name__}"
        return np.zeros((h, w), dtype=bool), metrics

    raw = (alpha > 24) & valid_area
    cleaned = morph(raw, 2, "dilate")
    cleaned = morph(cleaned, 2, "erode")
    cleaned = finalize_body_candidate(cleaned, h, w) & valid_area
    cleaned = finalize_body_candidate(cleaned, h, w) & valid_area
    x0, y0, x1, y1 = mask_bbox(cleaned)
    area_fraction = float(cleaned.mean())
    valid_coverage = float(cleaned.sum() / max(1, int(valid_area.sum())))
    padding_fraction = float((~valid_area).mean())
    padding_boundary = morph(~valid_area, 2, "dilate") & valid_area
    padding_boundary_contact = float((cleaned & padding_boundary).sum() / max(1, int(cleaned.sum())))
    straight_fraction = straight_boundary_fraction(cleaned)
    shape = body_shape_metrics(cleaned, valid_area)
    border_touch = mask_border_touch_fraction(cleaned)
    bbox_width_fraction = float((x1 - x0) / max(1, w))
    bbox_height_fraction = float((y1 - y0) / max(1, h))
    ellipse_fraction = float((cleaned & ellipse).sum() / max(1, int(cleaned.sum())))
    touches_many_edges = int(cleaned[0, :].any()) + int(cleaned[-1, :].any()) + int(cleaned[:, 0].any()) + int(cleaned[:, -1].any())
    confidence = score_body_candidate(cleaned, ellipse)

    accepted = (
        area_fraction >= 0.035
        and area_fraction <= 0.72
        and not (padding_fraction > 0.035 and valid_coverage > 0.88)
        and not (padding_fraction > 0.035 and padding_boundary_contact > 0.055)
        and not (padding_fraction > 0.035 and straight_fraction > 0.42)
        and not (padding_fraction > 0.035 and float(shape["shape_score"]) < -0.45)
        and border_touch <= 0.018
        and touches_many_edges <= 1
        and not (touches_many_edges > 0 and bbox_width_fraction > 0.94 and bbox_height_fraction > 0.82)
        and confidence > 0.25
    )
    metrics.update(
        {
            f"{prefix}_available": True,
            f"{prefix}_accepted": bool(accepted),
            f"{prefix}_confidence_score": float(confidence),
            f"{prefix}_area_px": int(cleaned.sum()),
            f"{prefix}_area_fraction": area_fraction,
            f"{prefix}_valid_area_coverage": valid_coverage,
            f"{prefix}_padding_boundary_contact": padding_boundary_contact,
            f"{prefix}_straight_boundary_fraction": straight_fraction,
            f"{prefix}_shape_score": float(shape["shape_score"]),
            f"{prefix}_shape_extent": float(shape["shape_extent"]),
            f"{prefix}_shape_width_variation": float(shape["shape_width_variation"]),
            f"{prefix}_shape_taper_score": float(shape["shape_taper_score"]),
            f"{prefix}_bbox": [x0, y0, x1, y1],
            f"{prefix}_border_touch_fraction": border_touch,
            f"{prefix}_bbox_width_fraction": bbox_width_fraction,
            f"{prefix}_bbox_height_fraction": bbox_height_fraction,
            f"{prefix}_ellipse_fraction": ellipse_fraction,
            f"{prefix}_touched_edges": int(touches_many_edges),
        }
    )
    if not accepted:
        return np.zeros((h, w), dtype=bool), metrics
    return cleaned.astype(bool), metrics


def ml_body_mask_from_image(
    rgb: np.ndarray,
    gray: np.ndarray,
    ellipse: np.ndarray,
    valid_area: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, Any]]:
    if valid_area is None:
        valid_area = np.ones_like(gray, dtype=bool)
    u2_body, u2_metrics = segment_body_with_rembg(rgb, ellipse, "u2net", valid_area)
    metrics: dict[str, Any] = {
        "ml_body_method": "u2net",
        "ml_body_available": bool(u2_metrics.get("u2net_available")),
        "ml_body_accepted": bool(u2_metrics.get("u2net_accepted")),
        **u2_metrics,
    }
    h, w = gray.shape
    border_px = max(8, round(min(h, w) * 0.055))
    border = np.zeros((h, w), dtype=bool)
    border[:border_px, :] = True
    border[-border_px:, :] = True
    border[:, :border_px] = True
    border[:, -border_px:] = True
    black_border = float(np.median(gray[border])) < 6.0
    u2_area = float(u2_metrics.get("u2net_area_fraction") or 0.0)
    u2_valid_coverage = float(u2_metrics.get("u2net_valid_area_coverage") or 0.0)
    u2_bbox_w = float(u2_metrics.get("u2net_bbox_width_fraction") or 0.0)
    u2_bbox_h = float(u2_metrics.get("u2net_bbox_height_fraction") or 0.0)
    crop_like_u2net = black_border and (
        u2_valid_coverage > 0.88
        or (
            u2_area > 0.46
            and (u2_bbox_w > 0.84 or u2_bbox_h > 0.92)
        )
    )
    metrics["ml_body_black_border"] = bool(black_border)
    metrics["ml_body_u2net_crop_like"] = bool(crop_like_u2net)
    if not crop_like_u2net:
        return u2_body, metrics

    isnet_body, isnet_metrics = segment_body_with_rembg(
        rgb,
        ellipse,
        "isnet-general-use",
        valid_area,
        neutralize_padding=False,
    )
    metrics.update(isnet_metrics)
    isnet_area = float(isnet_metrics.get("isnet_general_use_area_fraction") or 0.0)
    isnet_bh = float(isnet_metrics.get("isnet_general_use_bbox_height_fraction") or 0.0)
    isnet_bw = float(isnet_metrics.get("isnet_general_use_bbox_width_fraction") or 0.0)
    isnet_crop_like = isnet_area > 0.52 and (isnet_bh > 0.92 or isnet_bw > 0.92)
    if bool(isnet_metrics.get("isnet_general_use_accepted")) and not isnet_crop_like and 0.08 <= isnet_area <= max(0.44, u2_area * 0.88):
        metrics.update(
            {
                "ml_body_method": "isnet-general-use",
                "ml_body_available": True,
                "ml_body_accepted": True,
                "ml_body_isnet_rescue": True,
                "ml_body_isnet_crop_like": bool(isnet_crop_like),
            }
        )
        return isnet_body, metrics
    metrics["ml_body_isnet_rescue"] = False
    metrics["ml_body_isnet_crop_like"] = bool(isnet_crop_like)
    return u2_body, metrics


def gradient_magnitude(gray: np.ndarray) -> np.ndarray:
    g = gray.astype(np.float32)
    gx = np.zeros_like(g)
    gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    gy[1:-1, :] = g[2:, :] - g[:-2, :]
    return np.hypot(gx, gy)


def flood_from_border(passable: np.ndarray) -> np.ndarray:
    h, w = passable.shape
    seen = np.zeros_like(passable, dtype=bool)
    stack: list[tuple[int, int]] = []
    for x in range(w):
        if passable[0, x]:
            stack.append((0, x))
            seen[0, x] = True
        if passable[h - 1, x] and not seen[h - 1, x]:
            stack.append((h - 1, x))
            seen[h - 1, x] = True
    for y in range(h):
        if passable[y, 0] and not seen[y, 0]:
            stack.append((y, 0))
            seen[y, 0] = True
        if passable[y, w - 1] and not seen[y, w - 1]:
            stack.append((y, w - 1))
            seen[y, w - 1] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    return seen


def edge_barrier_body_mask(gray: np.ndarray, ellipse: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Use the visible manta perimeter as a barrier, then flood background.

    This directly addresses the perimeter-halo observation: if the edge is
    strong enough to create halo artifacts, it should also help block a
    background flood fill. The output is still deterministic and inspectable.
    """
    h, w = gray.shape
    grad = gradient_magnitude(box_blur(gray, max(2, round(max(h, w) * 0.004))))
    valid_grad = grad[ellipse]
    if valid_grad.size == 0:
        return np.zeros_like(gray, dtype=bool), {"edge_body_failure": "empty_ellipse"}
    thr = max(10.0, float(np.percentile(valid_grad, 86)))
    strong_edge = (grad >= thr) & ellipse
    # Close/dilate barriers so the flood does not leak through small gaps in
    # the manta perimeter. A thin barrier is enough; too thick eats the body.
    barrier = morph(close_mask(strong_edge, 2), max(2, round(max(h, w) * 0.006)), "dilate")
    passable = ~barrier
    flooded_bg = flood_from_border(passable)
    enclosed = (~flooded_bg) & ellipse
    enclosed = finalize_body_candidate(enclosed, h, w)
    # If the barrier only enclosed tiny texture islands, do not trust it.
    if float(enclosed.mean()) < 0.035:
        enclosed = np.zeros_like(gray, dtype=bool)
    return enclosed, {
        "edge_body_gradient_threshold": float(thr),
        "edge_body_barrier_px": int(barrier.sum()),
        "edge_body_area_px": int(enclosed.sum()),
        "edge_body_area_fraction": float(enclosed.mean()),
    }


def border_background_distance(rgb: np.ndarray, gray: np.ndarray, sat: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Estimate per-pixel distance from the border/background color family."""
    h, w = gray.shape
    border_px = max(8, round(min(h, w) * 0.055))
    border = np.zeros((h, w), dtype=bool)
    border[:border_px, :] = True
    border[-border_px:, :] = True
    border[:, :border_px] = True
    border[:, -border_px:] = True
    arr = rgb.astype(np.float32) / 255.0
    features = np.dstack([arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], gray / 255.0, sat])
    bg = features[border]
    med = np.median(bg, axis=0)
    mad = np.median(np.abs(bg - med), axis=0) + 0.035
    z = np.abs((features - med) / mad)
    # Weighted toward chroma/brightness differences. This avoids pure edge
    # chasing and asks whether a pixel looks like the border water/background.
    dist = 0.23 * z[:, :, 0] + 0.23 * z[:, :, 1] + 0.23 * z[:, :, 2] + 0.18 * z[:, :, 3] + 0.13 * z[:, :, 4]
    metrics = {
        "bg_border_px": int(border_px),
        "bg_feature_median": [float(x) for x in med.tolist()],
        "bg_feature_mad": [float(x) for x in mad.tolist()],
    }
    return dist.astype(np.float32), metrics


def score_body_candidate(mask: np.ndarray, ellipse: np.ndarray) -> float:
    area = float(mask.mean())
    if area <= 0.015:
        return -1.0
    x0, y0, x1, y1 = mask_bbox(mask)
    h, w = mask.shape
    bw = (x1 - x0) / max(1, w)
    bh = (y1 - y0) / max(1, h)
    cy, cx = np.array(np.nonzero(mask)).mean(axis=1) if int(mask.sum()) else (h / 2, w / 2)
    center_dist = math.hypot((float(cx) - w / 2) / max(1, w), (float(cy) - h / 2) / max(1, h))
    border_touch = (
        int(mask[0, :].sum() + mask[-1, :].sum() + mask[:, 0].sum() + mask[:, -1].sum())
        / max(1, int(mask.sum()))
    )
    ellipse_fraction = float((mask & ellipse).sum() / max(1, int(mask.sum())))
    area_score = 1.0 - min(1.0, abs(area - 0.26) / 0.34)
    bbox_score = 1.0 - min(1.0, abs(bw - 0.58) * 0.9 + abs(bh - 0.58) * 0.5)
    edge_follow_bonus = 0.6 if ellipse_fraction > 0.72 and border_touch < 0.03 else 0.0
    return float(2.2 * area_score + 1.2 * bbox_score + 1.6 * ellipse_fraction + edge_follow_bonus - 2.4 * center_dist - 3.0 * border_touch)


def finalize_body_candidate(candidate: np.ndarray, h: int, w: int) -> np.ndarray:
    candidate = close_mask(open_mask(candidate, 2), max(5, round(max(h, w) * 0.018)))
    body = largest_component(candidate, prefer_center=True)
    body = fill_holes(close_mask(body, max(5, round(max(h, w) * 0.018))))
    return body.astype(bool)


def body_mask_from_image(rgb: np.ndarray, gray: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    h, w = gray.shape
    sat = saturation(rgb)
    valid_area, valid_metrics = valid_photo_area_mask(rgb, gray)
    smooth_gray = box_blur(gray, max(9, round(max(h, w) * 0.018)))
    smooth_sat = box_blur(sat, max(9, round(max(h, w) * 0.018)))
    yy, xx = np.mgrid[0:h, 0:w]
    ellipse = ((xx - w / 2) / (w * 0.46 + EPS)) ** 2 + ((yy - h * 0.52) / (h * 0.47 + EPS)) ** 2 < 1.0
    ellipse = ellipse & valid_area

    plain_white_fraction = float(((gray > 245.0) & (sat < 0.10)).mean())
    if plain_white_fraction > 0.18:
        nonwhite = (smooth_gray < 246.0) & ellipse & valid_area
        nonwhite = close_mask(open_mask(nonwhite, 2), 7)
        export_body = fill_holes(close_mask(largest_component(nonwhite, prefer_center=True), 9))
        export_body &= valid_area
        if int(export_body.sum()) >= int(0.05 * h * w):
            x0, y0, x1, y1 = mask_bbox(export_body)
            return export_body.astype(bool), {
                "body_mask_method": "white_background_nonwhite_component",
                "body_mask_confidence": 0.9,
                "body_area_px": int(export_body.sum()),
                "body_area_fraction": float(export_body.mean()),
                "body_bbox": [x0, y0, x1, y1],
                **valid_metrics,
            }

    ml_body, ml_metrics = ml_body_mask_from_image(rgb, gray, ellipse, valid_area)
    edge_body, edge_metrics = edge_barrier_body_mask(smooth_gray, ellipse)
    bg_dist, bg_metrics = border_background_distance(rgb, gray, sat)
    bg_thr = max(2.1, float(np.percentile(bg_dist, 70)))
    bgdiff_candidate = (bg_dist > bg_thr) & ellipse & (smooth_gray > 4.0) & valid_area
    bgdiff_body = finalize_body_candidate(bgdiff_candidate, h, w) & valid_area

    sat_thr = float(np.percentile(smooth_sat, 62))
    bright_thr = float(np.percentile(smooth_gray, 38))
    dark_thr = float(np.percentile(smooth_gray, 8))
    near_white_background = (smooth_gray > 242.0) & (smooth_sat < 0.10)
    candidate = ((smooth_sat <= sat_thr) | (smooth_gray >= bright_thr)) & (smooth_gray > dark_thr) & ellipse & ~near_white_background & valid_area
    threshold_body = finalize_body_candidate(candidate, h, w) & valid_area

    candidate_options = [
        ("rembg_u2net_subject", ml_body),
        ("edge_barrier_flood", edge_body),
        ("border_background_difference", bgdiff_body),
        ("low_saturation_bright_component", threshold_body),
    ]

    min_area = int(0.09 * h * w)
    scored = []
    padding_boundary = morph(~valid_area, 2, "dilate") & valid_area
    for name, mask in candidate_options:
        score = score_body_candidate(mask, ellipse)
        shape = body_shape_metrics(mask, valid_area)
        score += 0.85 * float(shape["shape_score"])
        if float(valid_metrics.get("padding_area_fraction") or 0.0) > 0.035:
            valid_coverage = float(mask.sum() / max(1, int(valid_area.sum())))
            if valid_coverage > 0.88:
                score -= 7.0
            elif valid_coverage > 0.72:
                score -= 3.0
            boundary_contact = float((mask & padding_boundary).sum() / max(1, int(mask.sum())))
            if boundary_contact > 0.055:
                score -= 2.8
            straight_fraction = straight_boundary_fraction(mask)
            if straight_fraction > 0.42:
                score -= 2.2
        if name == "rembg_u2net_subject" and ml_metrics.get("ml_body_accepted"):
            # When the local subject model passes the conservative gate, prefer
            # it over color-only masks that often include reef/photo borders.
            score += 0.75
        scored.append((score, name, mask))
    scored.sort(reverse=True, key=lambda row: row[0])
    best_score, method, body = scored[0]
    segmentation_warning = ""
    if best_score < -1.0:
        segmentation_warning = "all_body_mask_candidates_scored_poorly"
        confidence = 0.28 if float(valid_metrics.get("padding_area_fraction") or 0.0) > 0.035 else 0.42
    elif best_score < 0.35:
        segmentation_warning = "weak_body_mask_candidate"
        confidence = 0.52
    elif method == "rembg_u2net_subject":
        confidence = 0.95 if best_score > 1.2 else 0.88
    elif method == "border_background_difference" and best_score > 1.2:
        confidence = 0.92
    else:
        confidence = 0.82
    if int(body.sum()) < min_area:
        fallback = (smooth_gray > np.percentile(smooth_gray[ellipse], 28)) & ellipse & ~near_white_background & valid_area
        body = finalize_body_candidate(fallback, h, w) & valid_area
        method = "central_luminance_fallback"
        confidence = 0.75
    if int(body.sum()) < min_area:
        body = ellipse
        method = "central_ellipse_fallback"
        confidence = 0.35

    x0, y0, x1, y1 = mask_bbox(body)
    metrics = {
        "body_mask_method": method,
        "body_mask_confidence": confidence,
        "body_mask_selector_score": float(best_score),
        "body_mask_warning": segmentation_warning,
        "body_area_px": int(body.sum()),
        "body_area_fraction": float(body.mean()),
        "body_bbox": [x0, y0, x1, y1],
        "body_candidate_scores": {name: float(score) for score, name, _ in scored},
        "body_bg_distance_threshold": float(bg_thr),
        **valid_metrics,
        **ml_metrics,
        **edge_metrics,
        **bg_metrics,
    }
    return body.astype(bool), metrics


def body_axis_angle_degrees(body: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(body)
    if len(xs) < 80:
        return 0.0, 1.0
    pts = np.vstack([xs.astype(np.float64), ys.astype(np.float64)])
    cov = np.cov(pts)
    vals, vecs = np.linalg.eigh(cov)
    order = np.argsort(vals)
    major = vecs[:, order[-1]]
    angle = float(math.degrees(math.atan2(major[1], major[0])))
    while angle <= -90.0:
        angle += 180.0
    while angle > 90.0:
        angle -= 180.0
    ratio = float(vals[order[-1]] / max(vals[order[-2]], EPS))
    return angle, ratio


def rotate_rgb(rgb: np.ndarray, degrees: float) -> np.ndarray:
    img = Image.fromarray(rgb).convert("RGB")
    rotated = img.rotate(degrees, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(0, 0, 0))
    return np.asarray(rotated).astype(np.uint8)


def normalize_angle_90(angle: float) -> float:
    while angle <= -90.0:
        angle += 180.0
    while angle > 90.0:
        angle -= 180.0
    return float(angle)


def angle_delta_90(a: float, b: float) -> float:
    return abs(normalize_angle_90(a - b))


def head_front_line_angle_degrees(body: np.ndarray) -> tuple[float | None, dict[str, Any]]:
    """Estimate the cephalic/head-front line angle from the upper silhouette.

    For curated ventral images the line connecting the two cephalic-fin/head
    front landmarks should be roughly horizontal. This is a better canonical
    alignment cue than a whole-body PCA axis when one wing is cropped or the
    photo frame was rotated.
    """
    x0, y0, x1, y1 = mask_bbox(body)
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    columns: list[tuple[int, int]] = []
    for x in range(x0, x1):
        ys = np.flatnonzero(body[:, x])
        if ys.size:
            columns.append((x, int(ys.min())))
    if len(columns) < max(20, int(bw * 0.18)):
        return None, {"head_front_failure": "too_few_boundary_columns"}

    arr = np.asarray(columns, dtype=np.float64)
    # Keep the upper silhouette, but not just the single top pixel. The cephalic
    # front is often a short band with glare or soft mask edges.
    y_limit = min(float(y0 + bh * 0.34), float(np.percentile(arr[:, 1], 30)))
    pts = arr[arr[:, 1] <= y_limit]
    if pts.shape[0] < max(14, int(bw * 0.10)):
        pts = arr[arr[:, 1] <= float(y0 + bh * 0.42)]
    if pts.shape[0] < max(14, int(bw * 0.10)):
        return None, {
            "head_front_failure": "too_few_upper_points",
            "head_front_boundary_columns": int(len(columns)),
        }

    x_spread = float(np.percentile(pts[:, 0], 90) - np.percentile(pts[:, 0], 10))
    if x_spread < bw * 0.16:
        return None, {
            "head_front_failure": "upper_points_too_narrow",
            "head_front_x_spread_fraction": float(x_spread / max(1, bw)),
        }

    centered = pts - pts.mean(axis=0)
    cov = np.cov(centered.T)
    vals, vecs = np.linalg.eigh(cov)
    axis = vecs[:, int(np.argmax(vals))]
    if axis[0] < 0:
        axis *= -1.0
    angle = normalize_angle_90(math.degrees(math.atan2(float(axis[1]), float(axis[0]))))
    quality = float(min(1.0, (x_spread / max(1, bw)) / 0.42))
    return angle, {
        "head_front_angle_degrees": float(angle),
        "head_front_quality": quality,
        "head_front_points": int(pts.shape[0]),
        "head_front_center": [float(pts[:, 0].mean()), float(pts[:, 1].mean())],
        "head_front_x_spread_fraction": float(x_spread / max(1, bw)),
        "head_front_y_limit": float(y_limit),
    }


def landmark_axis_rotation_degrees(body: np.ndarray, front_metrics: dict[str, Any]) -> tuple[float | None, dict[str, Any]]:
    """Estimate head-to-tail orientation from anatomical landmark proxies."""
    head_center = front_metrics.get("head_front_center")
    if not isinstance(head_center, list) or len(head_center) != 2:
        return None, {"landmark_axis_failure": "missing_head_front_center"}
    ys, xs = np.nonzero(body)
    if len(xs) < 80:
        return None, {"landmark_axis_failure": "too_few_body_pixels"}
    x0, y0, x1, y1 = mask_bbox(body)
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    head = np.asarray(head_center, dtype=np.float64)
    pts = np.vstack([xs.astype(np.float64), ys.astype(np.float64)]).T
    body_center = pts.mean(axis=0)

    lower = pts[pts[:, 1] >= y0 + bh * 0.50]
    tail_tip = None
    tail_score = 0.0
    if lower.shape[0] >= 20:
        d = np.linalg.norm(lower - head, axis=1)
        far = lower[int(np.argmax(d))]
        row_y = int(round(float(far[1])))
        row_xs = np.flatnonzero(body[row_y, :]) if 0 <= row_y < body.shape[0] else np.array([])
        row_width_fraction = float(row_xs.size / max(1, bw))
        center_distance_fraction = float(abs(float(far[0]) - float(body_center[0])) / max(1, bw))
        # A real tail/lower tip is usually narrow and not all the way out on a
        # wingtip. If that is not true, fall back to head-to-body-center.
        if row_width_fraction <= 0.28 and center_distance_fraction <= 0.38:
            tail_tip = far
            tail_score = float(min(1.0, (0.28 - row_width_fraction) / 0.22 + 0.25))

    target = tail_tip if tail_tip is not None else body_center
    vector = target - head
    distance_fraction = float(np.linalg.norm(vector) / max(1.0, bh))
    if vector[1] <= 0 or distance_fraction < 0.12:
        return None, {
            "landmark_axis_failure": "weak_head_to_tail_vector",
            "landmark_axis_distance_fraction": distance_fraction,
            "landmark_tail_tip_used": bool(tail_tip is not None),
        }
    axis_angle = normalize_angle_90(math.degrees(math.atan2(float(vector[1]), float(vector[0]))))
    rotation = normalize_angle_90(axis_angle - 90.0)
    quality = float(min(1.0, distance_fraction / 0.42))
    if tail_tip is not None:
        quality = max(quality, tail_score)
    return rotation, {
        "landmark_axis_angle_degrees": float(axis_angle),
        "landmark_axis_rotation_degrees": float(rotation),
        "landmark_axis_quality": quality,
        "landmark_axis_distance_fraction": distance_fraction,
        "landmark_head_center": [float(head[0]), float(head[1])],
        "landmark_body_center": [float(body_center[0]), float(body_center[1])],
        "landmark_tail_tip": [float(target[0]), float(target[1])],
        "landmark_tail_tip_used": bool(tail_tip is not None),
    }


def canonical_rotation_degrees(body: np.ndarray) -> tuple[float, dict[str, Any]]:
    front_angle, front_metrics = head_front_line_angle_degrees(body)
    landmark_rotation, landmark_metrics = landmark_axis_rotation_degrees(body, front_metrics)
    frame = body_coordinate_frame(body)
    frame_metrics: dict[str, Any] = {}
    axis_rotation: float | None = None
    if frame is not None:
        head_tail = np.asarray(frame["head_tail_axis"], dtype=np.float64)
        head_tail_angle = normalize_angle_90(math.degrees(math.atan2(float(head_tail[1]), float(head_tail[0]))))
        axis_rotation = normalize_angle_90(head_tail_angle - 90.0)
        frame_metrics = {
            "canonical_head_tail_angle_degrees": float(head_tail_angle),
            "canonical_axis_rotation_degrees": float(axis_rotation),
            "canonical_body_frame": frame,
        }

    front_quality = float(front_metrics.get("head_front_quality") or 0.0)
    landmark_quality = float(landmark_metrics.get("landmark_axis_quality") or 0.0)
    if landmark_rotation is not None and landmark_quality >= 0.35:
        if axis_rotation is not None:
            landmark_axis_conflict = angle_delta_90(landmark_rotation, axis_rotation)
            frame_metrics["canonical_landmark_axis_conflict_degrees"] = float(landmark_axis_conflict)
            if abs(axis_rotation) >= 12.0 and landmark_axis_conflict >= 18.0:
                return axis_rotation, {
                    "canonical_orientation_method": "head_tail_axis_landmark_conflict_override",
                    **front_metrics,
                    **landmark_metrics,
                    **frame_metrics,
                }
        if front_angle is not None:
            frame_metrics["canonical_front_landmark_conflict_degrees"] = float(
                angle_delta_90(front_angle, landmark_rotation)
            )
        return landmark_rotation, {
            "canonical_orientation_method": "head_front_to_tail_landmark",
            **front_metrics,
            **landmark_metrics,
            **frame_metrics,
        }

    if front_angle is not None and axis_rotation is not None:
        conflict = angle_delta_90(front_angle, axis_rotation)
        frame_metrics["canonical_front_axis_conflict_degrees"] = float(conflict)
        # The head-front line is useful, but it can be fooled by a cropped or
        # softly segmented head. If the body/tail axis says the animal is still
        # strongly tilted, prefer the tail-to-6-o'clock constraint the reviewer
        # can verify visually.
        if abs(axis_rotation) >= 12.0 and conflict >= 18.0:
            return axis_rotation, {
                "canonical_orientation_method": "head_tail_axis_conflict_override",
                **front_metrics,
                **landmark_metrics,
                **frame_metrics,
            }

    if front_angle is not None and front_quality >= 0.35:
        return normalize_angle_90(front_angle), {
            "canonical_orientation_method": "head_front_line",
            **front_metrics,
            **landmark_metrics,
            **frame_metrics,
        }
    if axis_rotation is not None:
        return axis_rotation, {
            "canonical_orientation_method": "head_tail_axis_fallback",
            **front_metrics,
            **landmark_metrics,
            **frame_metrics,
        }
    return 0.0, {
        "canonical_orientation_method": "none",
        **front_metrics,
        **landmark_metrics,
        **frame_metrics,
    }


def normalize_body_orientation(rgb: np.ndarray, gray: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    body, metrics = body_mask_from_image(rgb, gray)
    angle, ratio = body_axis_angle_degrees(body)
    rotate_degrees, canonical_metrics = canonical_rotation_degrees(body)
    applied = False
    if AUTO_ORIENT and 4.0 <= abs(rotate_degrees) <= 75.0:
        rgb = rotate_rgb(rgb, rotate_degrees)
        gray = rgb_to_gray(rgb)
        body, metrics = body_mask_from_image(rgb, gray)
        applied = True
    metrics = {
        **metrics,
        "orientation_mode": ORIENTATION_MODE,
        "orientation_auto_orient_enabled": bool(AUTO_ORIENT),
        "orientation_axis_angle_degrees": float(angle),
        "orientation_axis_ratio": float(ratio),
        "orientation_rotation_candidate_degrees": float(rotate_degrees),
        "orientation_rotation_applied_degrees": float(rotate_degrees if applied else 0.0),
        "orientation_normalized": bool(applied),
        **canonical_metrics,
    }
    return rgb, gray, metrics


def body_coordinate_frame(body: np.ndarray) -> dict[str, Any] | None:
    """Return a stable body-relative coordinate frame for tilted mantas.

    The primary ROI must compare anatomy to anatomy. A screen-aligned rectangle
    fails when the manta was rotated during photo curation, so this frame uses
    the silhouette's broad wing axis as x and the perpendicular head-tail axis
    as y. The y axis is signed to point roughly downward in image coordinates,
    matching the head-up convention used in the catalog.
    """
    ys, xs = np.nonzero(body)
    if len(xs) < 80:
        return None
    pts = np.vstack([xs.astype(np.float64), ys.astype(np.float64)])
    center = pts.mean(axis=1)
    cov = np.cov(pts)
    vals, vecs = np.linalg.eigh(cov)
    order = np.argsort(vals)
    # Do not assume the largest PCA axis is always wing-to-wing. When a manta is
    # cropped or one wing dominates the silhouette, the largest axis can be the
    # head-tail body axis. Since catalog ventrals are curated head-up, choose the
    # PCA axis with the stronger screen-vertical component as head-tail.
    axis_a = vecs[:, order[-1]].astype(np.float64)
    axis_b = vecs[:, order[-2]].astype(np.float64)
    axis_a /= max(float(np.linalg.norm(axis_a)), EPS)
    axis_b /= max(float(np.linalg.norm(axis_b)), EPS)
    if abs(axis_a[1]) >= abs(axis_b[1]):
        head_tail = axis_a
        lateral = axis_b
        head_tail_variance = float(vals[order[-1]])
        lateral_variance = float(vals[order[-2]])
    else:
        head_tail = axis_b
        lateral = axis_a
        head_tail_variance = float(vals[order[-2]])
        lateral_variance = float(vals[order[-1]])
    if head_tail[1] < 0:
        head_tail *= -1.0
    lateral = np.array([head_tail[1], -head_tail[0]], dtype=np.float64)
    lateral /= max(float(np.linalg.norm(lateral)), EPS)
    if lateral[0] < 0:
        lateral *= -1.0
    rel = pts.T - center
    xproj = rel @ lateral
    yproj = rel @ head_tail
    xmin, xmax = float(xproj.min()), float(xproj.max())
    ymin, ymax = float(yproj.min()), float(yproj.max())
    if xmax - xmin < 10.0 or ymax - ymin < 10.0:
        return None
    angle = float(math.degrees(math.atan2(lateral[1], lateral[0])))
    return {
        "center": [float(center[0]), float(center[1])],
        "lateral_axis": [float(lateral[0]), float(lateral[1])],
        "head_tail_axis": [float(head_tail[0]), float(head_tail[1])],
        "x_range": [xmin, xmax],
        "y_range": [ymin, ymax],
        "lateral_axis_angle_degrees": angle,
        "axis_ratio": float(vals[order[-1]] / max(vals[order[-2]], EPS)),
        "head_tail_variance": head_tail_variance,
        "lateral_variance": lateral_variance,
        "head_tail_axis_source": "major_pca" if abs(axis_a[1]) >= abs(axis_b[1]) else "minor_pca",
    }


def body_frame_norm(x: float, y: float, frame: dict[str, Any]) -> tuple[float, float]:
    center = np.asarray(frame["center"], dtype=np.float64)
    lateral = np.asarray(frame["lateral_axis"], dtype=np.float64)
    head_tail = np.asarray(frame["head_tail_axis"], dtype=np.float64)
    xmin, xmax = [float(v) for v in frame["x_range"]]
    ymin, ymax = [float(v) for v in frame["y_range"]]
    rel = np.asarray([x, y], dtype=np.float64) - center
    xn = (float(rel @ lateral) - xmin) / max(EPS, xmax - xmin)
    yn = (float(rel @ head_tail) - ymin) / max(EPS, ymax - ymin)
    return float(xn), float(yn)


def body_frame_mask(
    body: np.ndarray,
    frame: dict[str, Any] | None,
    left: float,
    right: float,
    top: float,
    bottom: float,
) -> np.ndarray:
    if frame is None:
        return np.zeros_like(body, dtype=bool)
    h, w = body.shape
    yy, xx = np.mgrid[0:h, 0:w]
    center = np.asarray(frame["center"], dtype=np.float64)
    lateral = np.asarray(frame["lateral_axis"], dtype=np.float64)
    head_tail = np.asarray(frame["head_tail_axis"], dtype=np.float64)
    xmin, xmax = [float(v) for v in frame["x_range"]]
    ymin, ymax = [float(v) for v in frame["y_range"]]
    relx = xx.astype(np.float64) - center[0]
    rely = yy.astype(np.float64) - center[1]
    xn = (relx * lateral[0] + rely * lateral[1] - xmin) / max(EPS, xmax - xmin)
    yn = (relx * head_tail[0] + rely * head_tail[1] - ymin) / max(EPS, ymax - ymin)
    return body & (xn >= left) & (xn <= right) & (yn >= top) & (yn <= bottom)


def mask_bbox_or_fallback(mask: np.ndarray, fallback: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if int(mask.sum()) < 20:
        return fallback
    return mask_bbox(mask)


def roi_from_body(
    body: np.ndarray,
    override: tuple[int, int, int, int] | None = None,
    metrics: dict[str, Any] | None = None,
) -> tuple[int, int, int, int]:
    if override is not None:
        return override
    metrics = metrics or {}
    x0, y0, x1, y1 = mask_bbox(body)
    bw = x1 - x0
    bh = y1 - y0

    confidence = float(metrics.get("body_mask_confidence") or 0.0)
    straight = float(metrics.get("selected_shape_straight_boundary_fraction") or metrics.get("shape_straight_boundary_fraction") or 0.0)
    coverage = float(metrics.get("selected_shape_valid_area_coverage") or metrics.get("shape_valid_area_coverage") or 0.0)
    warning = str(metrics.get("body_mask_warning") or "")

    quality = confidence
    quality *= max(0.0, 1.0 - min(1.0, straight / 0.28) * 0.55)
    if coverage > 0.76:
        quality *= 0.55
    elif coverage > 0.68:
        quality *= 0.78
    if warning:
        quality *= 0.55
    quality = float(max(0.0, min(1.0, quality)))

    # When the body cutout is clean, background pixels are already excluded by
    # the hard body mask, so the primary ROI can safely be wider and recover
    # wing-adjacent chest, navel, and pelvic spots. Keep a guarded fallback only
    # for risky masks where reef/water/photo-border artifacts may remain.
    if quality >= 0.78:
        policy = "wide_primary_clean_cutout"
        left, right, top, bottom = 0.12, 0.88, 0.16, 0.94
    elif quality >= 0.58:
        policy = "moderate_primary_cutout"
        left, right, top, bottom = 0.20, 0.82, 0.20, 0.90
    else:
        policy = "guarded_primary_low_cutout_confidence"
        left, right, top, bottom = 0.30, 0.70, 0.25, 0.86

    metrics["roi_policy"] = policy
    metrics["roi_body_mask_confidence_used"] = confidence
    metrics["roi_straight_boundary_fraction_used"] = straight
    metrics["roi_valid_area_coverage_used"] = coverage
    metrics["roi_cutout_quality_used"] = quality
    metrics["roi_fraction_bounds"] = {"left": left, "right": right, "top": top, "bottom": bottom}
    rx0 = int(round(x0 + left * bw))
    rx1 = int(round(x0 + right * bw))
    ry0 = int(round(y0 + top * bh))
    ry1 = int(round(y0 + bottom * bh))
    return (max(0, rx0), max(0, ry0), min(body.shape[1], rx1), min(body.shape[0], ry1))


def primary_roi_from_body(
    body: np.ndarray,
    override: tuple[int, int, int, int] | None,
    metrics: dict[str, Any],
) -> tuple[tuple[int, int, int, int], np.ndarray, dict[str, Any] | None]:
    """Return the primary anatomical ROI bbox, mask, and coordinate frame."""
    rect_roi = roi_from_body(body, override, metrics)
    rect_mask = np.zeros_like(body, dtype=bool)
    x0, y0, x1, y1 = rect_roi
    rect_mask[y0:y1, x0:x1] = True
    if override is not None:
        metrics["roi_coordinate_frame"] = "manual_screen_rectangle"
        return rect_roi, rect_mask & body, None
    frame = body_coordinate_frame(body)
    if frame is not None:
        metrics["body_frame"] = frame
    metrics["roi_coordinate_frame"] = "curated_screen_rectangle"
    return rect_roi, rect_mask & body, None


def clean_cutout_score(metrics: dict[str, Any]) -> float:
    confidence = float(metrics.get("body_mask_confidence") or 0.0)
    straight = float(metrics.get("selected_shape_straight_boundary_fraction") or metrics.get("shape_straight_boundary_fraction") or 0.0)
    coverage = float(metrics.get("selected_shape_valid_area_coverage") or metrics.get("shape_valid_area_coverage") or 0.0)
    warning = str(metrics.get("body_mask_warning") or "")
    score = confidence
    score *= max(0.0, 1.0 - min(1.0, straight / 0.28) * 0.55)
    if coverage > 0.76:
        score *= 0.55
    elif coverage > 0.68:
        score *= 0.78
    if warning:
        score *= 0.55
    return float(max(0.0, min(1.0, score)))


def support_roi_from_body(body: np.ndarray, metrics: dict[str, Any]) -> tuple[int, int, int, int] | None:
    """Return a broad support ROI only when the cutout is clean enough.

    This is not the primary ID signature. It lets excellent masks contribute
    wing/peripheral spots as a capped bonus while poor masks contribute no broad
    context at all.
    """
    quality = clean_cutout_score(metrics)
    metrics["support_cutout_quality"] = quality
    if quality < 0.62:
        metrics["support_roi_policy"] = "disabled_low_cutout_quality"
        return None
    x0, y0, x1, y1 = mask_bbox(body)
    bw = x1 - x0
    bh = y1 - y0
    if quality >= 0.82:
        policy = "broad_full_body_support"
        left, right, top, bottom = 0.08, 0.92, 0.10, 0.96
    else:
        policy = "moderate_body_support"
        left, right, top, bottom = 0.16, 0.86, 0.16, 0.92
    metrics["support_roi_policy"] = policy
    rx0 = int(round(x0 + left * bw))
    rx1 = int(round(x0 + right * bw))
    ry0 = int(round(y0 + top * bh))
    ry1 = int(round(y0 + bottom * bh))
    return (max(0, rx0), max(0, ry0), min(body.shape[1], rx1), min(body.shape[0], ry1))


def support_roi_mask_from_body(
    body: np.ndarray,
    metrics: dict[str, Any],
    frame: dict[str, Any] | None,
) -> tuple[tuple[int, int, int, int], np.ndarray] | None:
    quality = clean_cutout_score(metrics)
    metrics["support_cutout_quality"] = quality
    if quality < 0.62:
        metrics["support_roi_policy"] = "disabled_low_cutout_quality"
        return None
    rect_roi = support_roi_from_body(body, metrics)
    if rect_roi is None:
        return None
    rect_mask = np.zeros_like(body, dtype=bool)
    x0, y0, x1, y1 = rect_roi
    rect_mask[y0:y1, x0:x1] = True
    if frame is None:
        metrics["support_roi_coordinate_frame"] = "screen_rectangle"
        return rect_roi, rect_mask & body
    if quality >= 0.82:
        left, right, top, bottom = 0.08, 0.92, 0.10, 0.96
    else:
        left, right, top, bottom = 0.16, 0.86, 0.16, 0.92
    oriented_mask = body_frame_mask(body, frame, left, right, top, bottom)
    if int(oriented_mask.sum()) < max(120, int(body.sum() * 0.08)):
        metrics["support_roi_coordinate_frame"] = "screen_rectangle_small_oriented_fallback"
        return rect_roi, rect_mask & body
    metrics["support_roi_coordinate_frame"] = "body_axis_oriented"
    return mask_bbox_or_fallback(oriented_mask, rect_roi), oriented_mask


def contour_from_component(mask: np.ndarray, pts: np.ndarray, max_points: int = 80) -> list[tuple[int, int]]:
    h, w = mask.shape
    boundary = []
    for y, x in pts:
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if ny < 0 or ny >= h or nx < 0 or nx >= w or not mask[ny, nx]:
                boundary.append((int(x), int(y)))
                break
    if len(boundary) <= max_points:
        return boundary
    step = max(1, len(boundary) // max_points)
    return boundary[::step][:max_points]


def region_zone(cx_norm: float, cy_norm: float) -> str:
    if cy_norm < 0.34:
        return "gill_chest"
    if cy_norm < 0.68:
        return "central_belly"
    return "pelvic_belly"


def reject_component_reason(
    *,
    area: int,
    min_area: int,
    max_area: int,
    cxn: float,
    cyn: float,
    aspect: float,
    eccentricity: float,
    line_score: float,
    width: int,
    height: int,
    contrast: float,
    roi_touch: bool,
) -> str | None:
    if area < min_area:
        return "too_small_speckle"
    if area > max_area:
        return "too_large_region"
    if roi_touch:
        return "touches_roi_boundary"

    # Anatomical edges are usually thin, elongated, high-eccentricity regions:
    # gill slit lines, fin borders, tail/cephalic edges, and shadow seams.
    thin = min(width, height) <= 5
    very_thin = min(width, height) <= 3
    elongated = aspect >= 5.2 or line_score >= 7.5
    very_elongated = aspect >= 7.5 or line_score >= 10.0
    high_ecc = eccentricity >= 0.94
    if (thin and elongated and high_ecc) or (very_thin and aspect >= 4.2):
        return "thin_linear_anatomical_edge"
    if very_elongated and high_ecc and area < max(80, min_area * 5):
        return "gill_or_fin_line_candidate"
    if cyn < 0.28 and elongated and high_ecc and contrast < 3.0:
        return "gill_slit_like_edge"
    if (cxn < 0.06 or cxn > 0.94 or cyn > 0.88) and elongated:
        return "margin_or_fin_border"
    return None


def artifact_weight_multiplier(
    *,
    cxn: float,
    cyn: float,
    area_norm: float,
    aspect: float,
    eccentricity: float,
    contrast: float,
) -> float:
    """Softly reduce false-positive influence without hiding debug evidence.

    The detector should still show suspicious regions so scientists/admins can
    audit them. Scoring, however, should not let long margin highlights, gill
    shadow bands, or broad low-contrast illumination swaths dominate true spot
    fields. This is intentionally a down-weight, not a rejection.
    """
    multiplier = 1.0
    near_side_or_pelvic_margin = cxn < 0.09 or cxn > 0.91 or cyn > 0.86
    border_like = aspect >= 3.2 or eccentricity >= 0.965
    broad_shadow_like = area_norm >= 0.010 and eccentricity >= 0.94 and contrast < 1.05
    gill_shadow_like = cyn < 0.35 and aspect >= 2.2 and eccentricity >= 0.94 and contrast < 1.15

    if near_side_or_pelvic_margin and border_like:
        multiplier *= 0.28
    elif near_side_or_pelvic_margin:
        multiplier *= 0.62
    if broad_shadow_like:
        multiplier *= 0.45
    if gill_shadow_like:
        multiplier *= 0.50
    if aspect >= 5.0 or eccentricity >= 0.985:
        multiplier *= 0.55
    return float(max(0.08, min(1.0, multiplier)))


def halo_exclusion_mask(body: np.ndarray, roi: tuple[int, int, int, int]) -> tuple[np.ndarray, dict[str, Any]]:
    """Mask perimeter halo zones before they become pigment components.

    Spotness is excellent at amplifying true pigment, but it also amplifies the
    bright/dark transition at body edges, head/cephalic margins, and ROI edges.
    Those halos often form large connected components and dominate matching.
    This mask removes only a conservative boundary band before connected
    components are measured.
    """
    h, w = body.shape
    x0, y0, x1, y1 = roi
    rw = max(1, x1 - x0)
    rh = max(1, y1 - y0)
    roi_mask = np.zeros_like(body, dtype=bool)
    roi_mask[y0:y1, x0:x1] = True

    body_band_radius = max(11, round(max(h, w) * 0.038))
    body_core = morph(body, body_band_radius, "erode")
    body_boundary_band = body & ~body_core

    yy, xx = np.mgrid[0:h, 0:w]
    side_band_px = max(8, round(rw * 0.045))
    bottom_band_px = max(8, round(rh * 0.040))
    top_head_band_px = max(5, round(rh * 0.018))
    roi_side_bottom_band = roi_mask & (
        (xx <= x0 + side_band_px)
        | (xx >= x1 - side_band_px)
        | (yy >= y1 - bottom_band_px)
    )
    # Keep this very shallow: it targets cephalic/head halo at the ROI boundary
    # without throwing away the gill-chest pattern.
    roi_top_head_band = roi_mask & (yy <= y0 + top_head_band_px)

    excluded = roi_mask & (body_boundary_band | roi_side_bottom_band | roi_top_head_band)
    return excluded, {
        "halo_body_band_radius_px": int(body_band_radius),
        "halo_roi_side_band_px": int(side_band_px),
        "halo_roi_bottom_band_px": int(bottom_band_px),
        "halo_roi_top_head_band_px": int(top_head_band_px),
        "halo_exclusion_px": int(excluded.sum()),
    }


def segment_pigment_regions(
    gray: np.ndarray,
    body: np.ndarray,
    roi: tuple[int, int, int, int],
    max_regions: int = 28,
    roi_mask_override: np.ndarray | None = None,
    coord_frame: dict[str, Any] | None = None,
) -> tuple[np.ndarray, np.ndarray, list[Region], dict[str, Any], list[RejectedRegion]]:
    h, w = gray.shape
    x0, y0, x1, y1 = roi
    inner_radius = max(9, round(max(h, w) * 0.025))
    inner = morph(body, inner_radius, "erode")
    if roi_mask_override is not None:
        roi_mask = roi_mask_override.astype(bool)
    else:
        roi_mask = np.zeros_like(body, dtype=bool)
        roi_mask[y0:y1, x0:x1] = True
    valid = inner & roi_mask
    if int(valid.sum()) < 200:
        valid = body & roi_mask

    local_bg = box_blur(gray, max(7, round(max(h, w) * 0.018)))
    bg = box_blur(gray, max(13, round(max(h, w) * 0.035)))
    broad_bg = box_blur(gray, max(19, round(max(h, w) * 0.075)))
    local_response = np.clip(local_bg - gray, 0, 255)
    medium_response = np.clip(bg - gray, 0, 255)
    broad_response = np.clip(broad_bg - gray, 0, 255)
    spotness = np.maximum(local_response, np.maximum(0.92 * medium_response, 0.58 * broad_response))
    vals = spotness[valid]
    gvals = gray[valid]
    if vals.size == 0:
        return valid, spotness, [], {"pigment_failure": "empty_roi"}, []

    local_vals = local_response[valid]
    medium_vals = medium_response[valid]
    broad_vals = broad_response[valid]
    contrast_p95 = float(np.percentile(vals, 95))
    spot_percentile = 76.0 if contrast_p95 < 34.0 else 80.0
    spot_thr = max(7.0, float(np.percentile(vals, spot_percentile)))
    local_thr = max(3.0, float(np.percentile(local_vals, 72.0)))
    medium_thr = max(5.0, float(np.percentile(medium_vals, 74.0)))
    broad_thr = max(8.0, float(np.percentile(broad_vals, 90.0)))
    gray_thr = float(np.percentile(gvals, 58))
    # Backlit photos often make the shaded white belly globally darker than the
    # head/face. Broad background subtraction alone then invents pigment swaths.
    # Require a local or medium-scale dark response; broad response can help
    # only when it is supported by at least weak local contrast.
    local_supported = (local_response >= local_thr) | (medium_response >= medium_thr)
    broad_supported = (broad_response >= broad_thr) & (local_response >= max(2.0, 0.55 * local_thr))
    raw = (spotness >= spot_thr) & (gray <= gray_thr) & (local_supported | broad_supported) & valid
    halo_mask, halo_metrics = halo_exclusion_mask(body, roi)
    raw_before_halo = int(raw.sum())
    raw &= ~halo_mask
    raw = close_mask(open_mask(raw, 1), 3)

    roi_area = max(1, int(valid.sum()))
    min_area = max(24, int(roi_area * 0.00060))
    max_area = max(min_area + 1, int(roi_area * 0.12))
    comps = connected_components(raw)
    regions: list[Region] = []
    rejected: list[RejectedRegion] = []
    temp_mask = np.zeros_like(raw, dtype=bool)
    for comp in comps:
        area = comp["area"]
        pts = comp["points"]
        ys = pts[:, 0].astype(np.float32)
        xs = pts[:, 1].astype(np.float32)
        cx = float(xs.mean())
        cy = float(ys.mean())
        bx0, by0, bx1, by1 = comp["bbox"]
        bw = max(1, bx1 - bx0)
        bh = max(1, by1 - by0)
        aspect = float(max(bw / bh, bh / bw))
        cov = np.cov(np.vstack([xs, ys])) if len(xs) > 2 else np.eye(2)
        eig = np.linalg.eigvalsh(cov)
        eccentricity = float(math.sqrt(max(0.0, 1.0 - min(eig) / max(max(eig), EPS))))
        line_score = float(math.sqrt(max(eig) / max(min(eig), EPS))) if len(xs) > 2 else 1.0
        local_darkness = float(np.mean(spotness[pts[:, 0], pts[:, 1]]))
        component_local_response = float(np.mean(local_response[pts[:, 0], pts[:, 1]]))
        component_medium_response = float(np.mean(medium_response[pts[:, 0], pts[:, 1]]))
        component_broad_response = float(np.mean(broad_response[pts[:, 0], pts[:, 1]]))
        contrast = float(local_darkness / (np.std(gvals) + 1.0))
        if coord_frame is not None:
            cxn, cyn = body_frame_norm(cx, cy, coord_frame)
        else:
            cxn = (cx - x0) / max(1, x1 - x0)
            cyn = (cy - y0) / max(1, y1 - y0)
        area_norm = area / float(roi_area)
        zone = region_zone(cxn, cyn)
        if coord_frame is not None:
            roi_touch = cxn <= 0.015 or cxn >= 0.985 or cyn <= 0.015 or cyn >= 0.985
        else:
            roi_touch = cx <= x0 + 3 or cx >= x1 - 3 or cy <= y0 + 3 or cy >= y1 - 3
        reason = reject_component_reason(
            area=area,
            min_area=min_area,
            max_area=max_area,
            cxn=cxn,
            cyn=cyn,
            aspect=aspect,
            eccentricity=eccentricity,
            line_score=line_score,
            width=bw,
            height=bh,
            contrast=contrast,
            roi_touch=roi_touch,
        )
        broad_only_shadow = (
            component_broad_response > max(component_local_response, component_medium_response) * 2.35
            and component_local_response < max(2.8, 0.65 * local_thr)
            and area_norm >= 0.0035
            and contrast < 1.35
        )
        if reason is None and broad_only_shadow:
            reason = "broad_lighting_shadow_not_spot"
        if reason:
            rejected.append(
                RejectedRegion(
                    reason=reason,
                    centroid=(cx, cy),
                    centroid_norm=(float(cxn), float(cyn)),
                    area=int(area),
                    bbox=(int(bx0), int(by0), int(bx1), int(by1)),
                    aspect=float(aspect),
                    eccentricity=float(eccentricity),
                    line_score=float(line_score),
                    zone=zone,
                )
            )
            continue
        radius = math.sqrt(area / math.pi)
        shape_penalty = 1.0 / (1.0 + max(0.0, aspect - 4.0) * 0.35)
        lateral_penalty = 0.82 if cxn < 0.08 or cxn > 0.92 else 1.0
        artifact_penalty = artifact_weight_multiplier(
            cxn=cxn,
            cyn=cyn,
            area_norm=area_norm,
            aspect=aspect,
            eccentricity=eccentricity,
            contrast=contrast,
        )
        weight = float(
            math.sqrt(area_norm * 1000.0)
            * (1.0 + min(3.0, contrast))
            * shape_penalty
            * ZONE_IMPORTANCE.get(zone, 1.0)
            * lateral_penalty
            * artifact_penalty
        )
        temp_mask[pts[:, 0], pts[:, 1]] = True
        regions.append(
            Region(
                id=0,
                centroid=(cx, cy),
                centroid_norm=(float(cxn), float(cyn)),
                area=int(area),
                area_norm=float(area_norm),
                bbox=(int(bx0), int(by0), int(bx1), int(by1)),
                radius=float(radius),
                aspect=aspect,
                eccentricity=eccentricity,
                mean_darkness=local_darkness,
                contrast=contrast,
                weight=weight,
                zone=zone,
                contour=contour_from_component(raw, pts),
            )
        )

    regions.sort(key=lambda r: r.weight, reverse=True)
    regions = regions[:max_regions]
    kept = np.zeros_like(raw, dtype=bool)
    for i, region in enumerate(regions, 1):
        region.id = i
        bx0, by0, bx1, by1 = region.bbox
        sub = temp_mask[by0:by1, bx0:bx1]
        kept[by0:by1, bx0:bx1] |= sub

    metrics = {
        "roi": [x0, y0, x1, y1],
        "roi_mask_area_px": int(roi_mask.sum()),
        "region_coordinate_frame": "body_axis_oriented" if coord_frame is not None else "screen_rectangle",
        "roi_area_px": roi_area,
        "inner_erode_radius_px": int(inner_radius),
        "spotness_threshold": spot_thr,
        "spotness_threshold_percentile": float(spot_percentile),
        "spotness_valid_p95": contrast_p95,
        "local_spotness_threshold": float(local_thr),
        "medium_spotness_threshold": float(medium_thr),
        "broad_spotness_threshold": float(broad_thr),
        "gray_threshold": gray_thr,
        "raw_component_count": len(comps),
        "raw_pigment_px_before_halo_suppression": int(raw_before_halo),
        "raw_pigment_px_after_halo_suppression": int(raw.sum()),
        **halo_metrics,
        "rejected_region_count": len(rejected),
        "rejected_region_reasons": rejection_reason_counts(rejected),
        "accepted_region_count": len(regions),
        "accepted_total_area": int(sum(r.area for r in regions)),
        "accepted_total_weight": float(sum(r.weight for r in regions)),
    }
    return kept, spotness, regions, metrics, rejected


def rejection_reason_counts(rejected: list[RejectedRegion]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rejected:
        counts[row.reason] = counts.get(row.reason, 0) + 1
    return counts


def signature_selection_score(regions: list[Region], metrics: dict[str, Any]) -> float:
    quality = signature_quality(regions)
    total_weight = float(sum(r.weight for r in regions))
    score = 0.0
    score += min(28.0, len(regions) * 2.4)
    score += 18.0 * min(1.0, total_weight / 80.0)
    score += 14.0 * float(quality["signature_gill_central_weight_fraction"])
    score += 7.0 * int(quality["signature_zone_count"])
    score -= 16.0 * float(quality["signature_margin_weight_fraction"])
    score -= 5.0 * len(quality["signature_quality_flags"])
    if len(regions) < 3:
        score -= 18.0
    if metrics.get("pigment_failure"):
        score -= 25.0
    return float(score)


def process_image(
    path: str | Path,
    long_edge: int = DEFAULT_LONG_EDGE,
    roi_override: tuple[int, int, int, int] | None = None,
    enhance: bool = False,
) -> ProcessedImage:
    rgb = load_rgb(path, long_edge)
    gray = rgb_to_gray(rgb)
    if roi_override is None:
        rgb, gray, body_metrics = normalize_body_orientation(rgb, gray)
        body, body_metrics_latest = body_mask_from_image(rgb, gray)
        body_metrics = {**body_metrics, **body_metrics_latest}
    else:
        body, body_metrics = body_mask_from_image(rgb, gray)
    roi, roi_mask, coord_frame = primary_roi_from_body(body, roi_override, body_metrics)

    def run_extraction(pass_gray: np.ndarray, enhancement_metrics: dict[str, Any]) -> dict[str, Any]:
        pigment, spotness, regions, pigment_metrics, rejected_regions = segment_pigment_regions(
            pass_gray,
            body,
            roi,
            roi_mask_override=roi_mask,
            coord_frame=coord_frame,
        )
        support_regions: list[Region] = []
        support_metrics: dict[str, Any] = {}
        support_roi_data = support_roi_mask_from_body(body, body_metrics, coord_frame)
        if support_roi_data is not None:
            support_roi, support_roi_mask = support_roi_data
            _, _, support_regions, raw_support_metrics, _ = segment_pigment_regions(
                pass_gray,
                body,
                support_roi,
                max_regions=36,
                roi_mask_override=support_roi_mask,
                coord_frame=coord_frame,
            )
            support_metrics = {
                "support_roi": list(support_roi),
                "support_region_count": len(support_regions),
                "support_accepted_total_weight": float(sum(r.weight for r in support_regions)),
                "support_accepted_total_area": int(sum(r.area for r in support_regions)),
                "support_raw_component_count": int(raw_support_metrics.get("raw_component_count") or 0),
                "support_rejected_region_count": int(raw_support_metrics.get("rejected_region_count") or 0),
                "support_rejected_region_reasons": raw_support_metrics.get("rejected_region_reasons", {}),
            }
        else:
            support_metrics = {
                "support_roi": [],
                "support_region_count": 0,
                "support_accepted_total_weight": 0.0,
                "support_accepted_total_area": 0,
            }
        metrics = {**body_metrics, **enhancement_metrics, **pigment_metrics, **support_metrics}
        metrics.update(signature_quality(regions))
        metrics["signature_selection_score"] = signature_selection_score(regions, metrics)
        if len(regions) < 3:
            metrics["low_region_warning"] = "fewer_than_3_regions"
        return {
            "gray": pass_gray,
            "pigment": pigment,
            "spotness": spotness,
            "regions": regions,
            "support_regions": support_regions,
            "metrics": metrics,
            "rejected_regions": rejected_regions,
        }

    normal = run_extraction(gray, {"enhancement_method": "disabled"})
    selected = normal
    if enhance or (ADAPTIVE_ENHANCE and MATCHER_MODE == "normal"):
        enhanced_gray, enhanced_metrics = enhanced_pigment_gray(gray, body, roi)
        enhanced = run_extraction(enhanced_gray, enhanced_metrics)
        normal_score = float(normal["metrics"].get("signature_selection_score") or 0.0)
        enhanced_score = float(enhanced["metrics"].get("signature_selection_score") or 0.0)
        force_enhanced = bool(enhance)
        sparse_normal = len(normal["regions"]) < 5 or not bool(normal["metrics"].get("signature_usable"))
        if force_enhanced or (sparse_normal and enhanced_score >= normal_score + 3.0):
            selected = enhanced
            selected["metrics"]["adaptive_enhance_selected"] = True
        else:
            selected["metrics"]["adaptive_enhance_selected"] = False
        selected["metrics"]["adaptive_enhance_enabled"] = bool(ADAPTIVE_ENHANCE and MATCHER_MODE == "normal")
        selected["metrics"]["adaptive_normal_selection_score"] = normal_score
        selected["metrics"]["adaptive_enhanced_selection_score"] = enhanced_score
        selected["metrics"]["adaptive_normal_region_count"] = len(normal["regions"])
        selected["metrics"]["adaptive_enhanced_region_count"] = len(enhanced["regions"])
    else:
        selected["metrics"]["adaptive_enhance_enabled"] = False
        selected["metrics"]["adaptive_enhance_selected"] = False

    gray = selected["gray"]
    pigment = selected["pigment"]
    spotness = selected["spotness"]
    regions = selected["regions"]
    support_regions = selected["support_regions"]
    metrics = selected["metrics"]
    rejected_regions = selected["rejected_regions"]
    inner = morph(body, max(9, round(max(gray.shape) * 0.025)), "erode")
    return ProcessedImage(str(path), rgb, gray, body, inner, roi, roi_mask & body, pigment, spotness, regions, support_regions, metrics, rejected_regions)


def signature_quality(regions: list[Region]) -> dict[str, Any]:
    """Explain whether a photo produced enough central belly signal to evaluate.

    This is intentionally conservative. A poor-quality query should be flagged
    as not usable for accuracy accounting instead of being treated as a normal
    matcher failure.
    """
    total_weight = sum(r.weight for r in regions) + EPS
    zone_weight: dict[str, float] = {}
    margin_weight = 0.0
    for r in regions:
        zone_weight[r.zone] = zone_weight.get(r.zone, 0.0) + r.weight
        x, y = r.centroid_norm
        if x < 0.08 or x > 0.92 or y > 0.86:
            margin_weight += r.weight

    zone_count = sum(1 for weight in zone_weight.values() if weight > 0.0)
    gill_central_weight = zone_weight.get("gill_chest", 0.0) + zone_weight.get("central_belly", 0.0)
    gill_central_fraction = gill_central_weight / total_weight
    margin_fraction = margin_weight / total_weight

    flags: list[str] = []
    if len(regions) < 5:
        flags.append("few_pigment_regions")
    if zone_count < 2:
        flags.append("single_zone_signature")
    if gill_central_fraction < 0.25:
        flags.append("low_gill_central_signal")
    if margin_fraction > 0.65:
        flags.append("margin_concentrated_signature")

    usable = not flags
    return {
        "signature_region_count": len(regions),
        "signature_zone_count": int(zone_count),
        "signature_gill_central_weight_fraction": float(gill_central_fraction),
        "signature_margin_weight_fraction": float(margin_fraction),
        "signature_usable": bool(usable),
        "signature_quality_flags": flags,
        "signature_zone_weights": {zone: float(zone_weight.get(zone, 0.0)) for zone in TRI_ZONES},
    }


def similarity_from_pairs(src: np.ndarray, dst: np.ndarray) -> np.ndarray | None:
    if src.shape[0] < 2:
        return None
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    sx = src - src_mean
    dx = dst - dst_mean
    denom = float((sx**2).sum())
    if denom < EPS:
        return None
    cov = sx.T @ dx / denom
    u, s, vt = np.linalg.svd(cov)
    r = u @ vt
    if np.linalg.det(r) < 0:
        u[:, -1] *= -1
        r = u @ vt
    scale = float(s.sum())
    a = scale * r
    t = dst_mean - src_mean @ a
    mat = np.eye(3, dtype=np.float64)
    mat[:2, :2] = a
    mat[2, :2] = t
    return mat


def affine_from_points(src: np.ndarray, dst: np.ndarray) -> np.ndarray | None:
    if src.shape[0] < 3 or dst.shape[0] < 3:
        return None
    x = np.hstack([src.astype(np.float64), np.ones((src.shape[0], 1), dtype=np.float64)])
    try:
        coeff, _, _, _ = np.linalg.lstsq(x, dst.astype(np.float64), rcond=None)
    except np.linalg.LinAlgError:
        return None
    a = coeff[:2, :]
    t = coeff[2, :]
    det = float(np.linalg.det(a))
    if not np.isfinite(det) or abs(det) < 0.12 or abs(det) > 3.2:
        return None
    try:
        cond = float(np.linalg.cond(a))
    except np.linalg.LinAlgError:
        return None
    if not np.isfinite(cond) or cond > 6.0:
        return None
    mat = np.eye(3, dtype=np.float64)
    mat[:2, :2] = a
    mat[2, :2] = t
    return mat


def transform_points(points: np.ndarray, mat: np.ndarray) -> np.ndarray:
    return points @ mat[:2, :2] + mat[2, :2]


def region_distance(a: Region, b: Region, p: np.ndarray | None = None) -> float:
    ax, ay = p.tolist() if p is not None else a.centroid_norm
    bx, by = b.centroid_norm
    spatial = math.hypot(ax - bx, ay - by)
    area = abs(math.log((a.area_norm + EPS) / (b.area_norm + EPS)))
    aspect = abs(math.log((a.aspect + EPS) / (b.aspect + EPS)))
    eccentricity = abs(a.eccentricity - b.eccentricity)
    contrast = abs(math.log((a.contrast + 0.25) / (b.contrast + 0.25)))
    zone_penalty = 0.030 if a.zone != b.zone else 0.0
    return spatial + 0.065 * area + 0.025 * aspect + 0.018 * eccentricity + 0.012 * contrast + zone_penalty


def region_similarity(a: Region, b: Region) -> float:
    area_similarity = min(a.area_norm, b.area_norm) / max(a.area_norm, b.area_norm, EPS)
    aspect_similarity = min(a.aspect, b.aspect) / max(a.aspect, b.aspect, EPS)
    eccentricity_similarity = max(0.0, 1.0 - abs(a.eccentricity - b.eccentricity))
    contrast_similarity = min(a.contrast + 0.25, b.contrast + 0.25) / max(a.contrast + 0.25, b.contrast + 0.25, EPS)
    darkness_similarity = min(a.mean_darkness + 1.0, b.mean_darkness + 1.0) / max(a.mean_darkness + 1.0, b.mean_darkness + 1.0, EPS)
    return float(area_similarity * (0.55 + 0.45 * aspect_similarity) * (0.65 + 0.35 * eccentricity_similarity) * (0.70 + 0.30 * contrast_similarity) * (0.85 + 0.15 * darkness_similarity))


def local_constellation_descriptors(regions: list[Region], k: int = 5, points: np.ndarray | None = None) -> dict[int, dict[str, Any]]:
    """Describe each region by the neighboring regions around it.

    Distances, directions, neighbor sizes, and neighbor zones should be more
    stable across photos of the same animal than raw global position alone.
    The descriptor is computed on demand so existing signature caches remain
    usable and inspectable.
    """
    descriptors: dict[int, dict[str, Any]] = {}
    if not regions:
        return descriptors
    pts = points.astype(np.float64) if points is not None else np.array([r.centroid_norm for r in regions], dtype=np.float64)
    for i, region in enumerate(regions):
        neighbors: list[dict[str, Any]] = []
        for j, other in enumerate(regions):
            if i == j:
                continue
            dx = float(pts[j, 0] - pts[i, 0])
            dy = float(pts[j, 1] - pts[i, 1])
            dist = float(math.hypot(dx, dy))
            if dist < EPS:
                continue
            angle = float(math.atan2(dy, dx))
            neighbors.append(
                {
                    "dist": dist,
                    "angle": angle,
                    "area_ratio": float(other.area_norm / max(region.area_norm, EPS)),
                    "weight_ratio": float(other.weight / max(region.weight, EPS)),
                    "same_zone": 1.0 if other.zone == region.zone else 0.0,
                    "zone": other.zone,
                }
            )
        neighbors.sort(key=lambda item: item["dist"])
        descriptors[region.id] = {"neighbors": neighbors[:k], "neighbor_count": len(neighbors)}
    return descriptors


def angle_similarity(a: float, b: float) -> float:
    delta = abs((a - b + math.pi) % (2.0 * math.pi) - math.pi)
    return float(max(0.0, 1.0 - delta / math.pi))


def constellation_similarity_for_regions(
    a: Region,
    b: Region,
    desc1: dict[int, dict[str, Any]],
    desc2: dict[int, dict[str, Any]],
) -> float:
    n1 = list(desc1.get(a.id, {}).get("neighbors", []))
    n2 = list(desc2.get(b.id, {}).get("neighbors", []))
    if not n1 or not n2:
        return 0.50

    candidate_pairs: list[tuple[float, int, int]] = []
    for i, p in enumerate(n1):
        for j, q in enumerate(n2):
            dist_sim = _scalar_similarity(float(p["dist"]), float(q["dist"]))
            area_sim = _scalar_similarity(float(p["area_ratio"]), float(q["area_ratio"]))
            weight_sim = _scalar_similarity(float(p["weight_ratio"]), float(q["weight_ratio"]))
            angle_sim = angle_similarity(float(p["angle"]), float(q["angle"]))
            zone_sim = 1.0 if p["zone"] == q["zone"] else 0.72
            sim = (0.36 * dist_sim + 0.20 * angle_sim + 0.18 * area_sim + 0.10 * weight_sim + 0.16 * zone_sim)
            candidate_pairs.append((sim, i, j))
    candidate_pairs.sort(reverse=True)
    used1: set[int] = set()
    used2: set[int] = set()
    sims: list[float] = []
    for sim, i, j in candidate_pairs:
        if i in used1 or j in used2:
            continue
        used1.add(i)
        used2.add(j)
        sims.append(float(sim))
        if len(sims) >= min(4, len(n1), len(n2)):
            break
    if not sims:
        return 0.35
    coverage = len(sims) / max(1, min(4, len(n1), len(n2)))
    return float(np.mean(sims) * (0.70 + 0.30 * coverage))


def assign_regions(regions1: list[Region], regions2: list[Region], mat: np.ndarray | None, max_dist: float = 0.115) -> list[dict[str, Any]]:
    if not regions1 or not regions2:
        return []
    src = np.array([r.centroid_norm for r in regions1], dtype=np.float64)
    pred = transform_points(src, mat) if mat is not None else src
    desc1 = local_constellation_descriptors(regions1, points=pred)
    desc2 = local_constellation_descriptors(regions2)
    candidates = []
    for i, r1 in enumerate(regions1):
        for j, r2 in enumerate(regions2):
            if pred[i, 0] < -0.08 or pred[i, 0] > 1.08 or pred[i, 1] < -0.08 or pred[i, 1] > 1.08:
                continue
            d = region_distance(r1, r2, pred[i])
            if d <= max_dist:
                candidates.append((d, i, j))
    candidates.sort()
    used1: set[int] = set()
    used2: set[int] = set()
    matches = []
    for d, i, j in candidates:
        if i in used1 or j in used2:
            continue
        used1.add(i)
        used2.add(j)
        r1 = regions1[i]
        r2 = regions2[j]
        shape_similarity = region_similarity(r1, r2)
        constellation_similarity = constellation_similarity_for_regions(r1, r2, desc1, desc2)
        matches.append(
            {
                "region1_id": r1.id,
                "region2_id": r2.id,
                "distance": float(d),
                "reprojection_error_norm": float(math.hypot(pred[i, 0] - r2.centroid_norm[0], pred[i, 1] - r2.centroid_norm[1])),
                "weight": float(min(r1.weight, r2.weight)),
                "area_similarity": float(min(r1.area_norm, r2.area_norm) / max(r1.area_norm, r2.area_norm, EPS)),
                "shape_similarity": shape_similarity,
                "constellation_similarity": float(constellation_similarity),
                "zone1": r1.zone,
                "zone2": r2.zone,
            }
        )
    return matches


def matched_constellation_metrics(matches: list[dict[str, Any]], regions1: list[Region], regions2: list[Region]) -> dict[str, Any]:
    """Score whether the accepted matches preserve neighborhood geometry.

    This is stricter than the per-region descriptor: it compares every pair of
    matched pigment regions and asks whether their spacing, direction, zone
    relationship, and relative area pattern agree. False matches often pass a
    local centroid/shape check but fail this group-level consistency check.
    """
    if len(matches) < 2:
        return {
            "matched_constellation_score": 0.0,
            "matched_constellation_pair_count": 0,
            "matched_constellation_floor": 0.0,
            "matched_constellation_bonus": 0.72,
        }
    by1 = {r.id: r for r in regions1}
    by2 = {r.id: r for r in regions2}
    pair_scores: list[float] = []
    for i in range(len(matches)):
        a1 = by1.get(int(matches[i]["region1_id"]))
        a2 = by2.get(int(matches[i]["region2_id"]))
        if a1 is None or a2 is None:
            continue
        for j in range(i + 1, len(matches)):
            b1 = by1.get(int(matches[j]["region1_id"]))
            b2 = by2.get(int(matches[j]["region2_id"]))
            if b1 is None or b2 is None:
                continue
            dx1 = float(b1.centroid_norm[0] - a1.centroid_norm[0])
            dy1 = float(b1.centroid_norm[1] - a1.centroid_norm[1])
            dx2 = float(b2.centroid_norm[0] - a2.centroid_norm[0])
            dy2 = float(b2.centroid_norm[1] - a2.centroid_norm[1])
            d1 = math.hypot(dx1, dy1)
            d2 = math.hypot(dx2, dy2)
            if d1 < 0.025 or d2 < 0.025:
                continue
            dist_sim = _scalar_similarity(d1, d2)
            angle_sim = angle_similarity(math.atan2(dy1, dx1), math.atan2(dy2, dx2))
            area_ratio1 = (a1.area_norm + EPS) / (b1.area_norm + EPS)
            area_ratio2 = (a2.area_norm + EPS) / (b2.area_norm + EPS)
            area_order = 1.0 if (area_ratio1 >= 1.0) == (area_ratio2 >= 1.0) else 0.70
            area_ratio_sim = _scalar_similarity(area_ratio1, area_ratio2)
            same_zone1 = a1.zone == b1.zone
            same_zone2 = a2.zone == b2.zone
            zone_relation = 1.0 if same_zone1 == same_zone2 else 0.72
            pair_scores.append(
                float(
                    0.42 * dist_sim
                    + 0.24 * angle_sim
                    + 0.16 * area_ratio_sim
                    + 0.10 * area_order
                    + 0.08 * zone_relation
                )
            )
    if not pair_scores:
        score = 0.0
        floor = 0.0
    else:
        pair_scores.sort()
        trim = pair_scores[max(0, int(len(pair_scores) * 0.15)) :]
        score = float(np.mean(trim))
        floor = float(np.percentile(pair_scores, 20))
    coverage = min(1.0, len(pair_scores) / 10.0)
    bonus = (0.58 + 0.58 * score) * (0.82 + 0.18 * coverage)
    if len(matches) >= 5 and floor < 0.46:
        bonus *= 0.88
    return {
        "matched_constellation_score": float(score),
        "matched_constellation_pair_count": int(len(pair_scores)),
        "matched_constellation_floor": float(floor),
        "matched_constellation_bonus": float(bonus),
    }


def constellation_pair_fingerprint(regions: list[Region], max_regions: int = 16) -> list[dict[str, Any]]:
    """Rotation-invariant fingerprint of spot spacing and size relationships.

    This intentionally ignores absolute x/y orientation. It asks whether the
    pattern of distances between meaningful pigment regions, relative spot
    sizes, and zone relationships looks similar, like a fingerprint that can be
    rotated and still recognized.
    """
    selected = [
        r
        for r in sorted(regions, key=lambda item: item.weight * primary_region_importance(item), reverse=True)[:max_regions]
        if primary_region_importance(r) >= 0.24
    ]
    if len(selected) < 3:
        return []
    raw_pairs: list[dict[str, Any]] = []
    distances: list[float] = []
    for i in range(len(selected)):
        a = selected[i]
        for j in range(i + 1, len(selected)):
            b = selected[j]
            d = float(math.hypot(a.centroid_norm[0] - b.centroid_norm[0], a.centroid_norm[1] - b.centroid_norm[1]))
            if d < 0.035:
                continue
            distances.append(d)
            zones = tuple(sorted((a.zone, b.zone)))
            raw_pairs.append(
                {
                    "dist": d,
                    "area_ratio": float(min(a.area_norm, b.area_norm) / max(a.area_norm, b.area_norm, EPS)),
                    "weight_ratio": float(min(a.weight, b.weight) / max(a.weight, b.weight, EPS)),
                    "zones": zones,
                    "same_zone": a.zone == b.zone,
                    "weight": float(math.sqrt(max(EPS, a.weight * b.weight))),
                }
            )
    if len(raw_pairs) < 3:
        return []
    scale = float(np.percentile(distances, 65))
    for row in raw_pairs:
        row["dist_norm"] = float(row["dist"] / max(scale, EPS))
    raw_pairs.sort(key=lambda item: item["weight"], reverse=True)
    return raw_pairs[: min(80, len(raw_pairs))]


def zone_pair_similarity(a: tuple[str, str], b: tuple[str, str]) -> float:
    if a == b:
        return 1.0
    overlap = len(set(a) & set(b))
    if overlap == 1:
        return 0.78
    return 0.58


def rotation_invariant_constellation_score(regions1: list[Region], regions2: list[Region]) -> dict[str, Any]:
    fp1 = constellation_pair_fingerprint(regions1)
    fp2 = constellation_pair_fingerprint(regions2)
    if not fp1 or not fp2:
        return {
            "rotation_invariant_constellation_score": 0.0,
            "rotation_invariant_constellation_pair_matches": 0,
            "rotation_invariant_constellation_coverage": 0.0,
        }
    candidates: list[tuple[float, int, int]] = []
    for i, a in enumerate(fp1):
        for j, b in enumerate(fp2):
            dist_sim = _scalar_similarity(float(a["dist_norm"]), float(b["dist_norm"]))
            area_sim = _scalar_similarity(float(a["area_ratio"]), float(b["area_ratio"]))
            weight_sim = _scalar_similarity(float(a["weight_ratio"]), float(b["weight_ratio"]))
            zone_sim = zone_pair_similarity(a["zones"], b["zones"])
            same_zone_sim = 1.0 if bool(a["same_zone"]) == bool(b["same_zone"]) else 0.76
            sim = float(0.42 * dist_sim + 0.22 * area_sim + 0.12 * weight_sim + 0.18 * zone_sim + 0.06 * same_zone_sim)
            candidates.append((sim, i, j))
    candidates.sort(reverse=True)
    used1: set[int] = set()
    used2: set[int] = set()
    sims: list[float] = []
    weighted: list[float] = []
    for sim, i, j in candidates:
        if i in used1 or j in used2:
            continue
        if sim < 0.54:
            continue
        used1.add(i)
        used2.add(j)
        sims.append(sim)
        weighted.append(sim * math.sqrt(float(fp1[i]["weight"]) * float(fp2[j]["weight"])))
        if len(sims) >= 18:
            break
    if not sims:
        score = 0.0
    else:
        robust = float(np.mean(sorted(sims)[max(0, int(len(sims) * 0.15)) :]))
        weight_quality = float(sum(weighted) / max(EPS, sum(math.sqrt(float(row["weight"])) for row in fp1[: len(sims) + 4])))
        score = 100.0 * robust * min(1.0, len(sims) / 10.0) * min(1.0, 0.45 + 0.55 * weight_quality)
    coverage = float(len(sims) / max(1, min(len(fp1), len(fp2), 18)))
    return {
        "rotation_invariant_constellation_score": float(score),
        "rotation_invariant_constellation_pair_matches": int(len(sims)),
        "rotation_invariant_constellation_coverage": coverage,
    }


def triangle_constellation_fingerprint(regions: list[Region], max_regions: int = 12) -> list[dict[str, Any]]:
    selected = [
        r
        for r in sorted(regions, key=lambda item: item.weight * primary_region_importance(item), reverse=True)[:max_regions]
        if primary_region_importance(r) >= 0.28
    ]
    if len(selected) < 3:
        return []
    triangles: list[dict[str, Any]] = []
    for i in range(len(selected)):
        a = selected[i]
        pa = np.asarray(a.centroid_norm, dtype=np.float64)
        for j in range(i + 1, len(selected)):
            b = selected[j]
            pb = np.asarray(b.centroid_norm, dtype=np.float64)
            for k in range(j + 1, len(selected)):
                c = selected[k]
                pc = np.asarray(c.centroid_norm, dtype=np.float64)
                sides = sorted(
                    [
                        float(np.linalg.norm(pa - pb)),
                        float(np.linalg.norm(pa - pc)),
                        float(np.linalg.norm(pb - pc)),
                    ]
                )
                if sides[-1] < 0.075 or sides[0] < 0.025:
                    continue
                # Skip nearly collinear triplets; long gill/edge artifacts can
                # make plausible pair distances but weak biological triangles.
                area2 = abs(float(np.cross(pb - pa, pc - pa)))
                shape_area = area2 / max(EPS, sides[-1] * sides[-1])
                if shape_area < 0.035:
                    continue
                areas = sorted([a.area_norm, b.area_norm, c.area_norm])
                zones = tuple(sorted([a.zone, b.zone, c.zone]))
                weight = float((a.weight * b.weight * c.weight) ** (1.0 / 3.0))
                triangles.append(
                    {
                        "side_ratios": [float(sides[0] / sides[-1]), float(sides[1] / sides[-1])],
                        "area_ratios": [float(areas[0] / max(areas[-1], EPS)), float(areas[1] / max(areas[-1], EPS))],
                        "zones": zones,
                        "shape_area": float(shape_area),
                        "weight": weight,
                    }
                )
    triangles.sort(key=lambda item: item["weight"], reverse=True)
    return triangles[: min(90, len(triangles))]


def zone_triple_similarity(a: tuple[str, str, str], b: tuple[str, str, str]) -> float:
    if a == b:
        return 1.0
    aa = list(a)
    bb = list(b)
    overlap = 0
    for zone in aa:
        if zone in bb:
            overlap += 1
            bb.remove(zone)
    return float(0.48 + 0.17 * overlap)


def rotation_invariant_triangle_score(regions1: list[Region], regions2: list[Region]) -> dict[str, Any]:
    fp1 = triangle_constellation_fingerprint(regions1)
    fp2 = triangle_constellation_fingerprint(regions2)
    if not fp1 or not fp2:
        return {
            "rotation_invariant_triangle_score": 0.0,
            "rotation_invariant_triangle_matches": 0,
            "rotation_invariant_triangle_coverage": 0.0,
        }
    candidates: list[tuple[float, int, int]] = []
    for i, a in enumerate(fp1):
        for j, b in enumerate(fp2):
            side_score = _hist_intersection(a["side_ratios"], b["side_ratios"])
            area_score = _hist_intersection(a["area_ratios"], b["area_ratios"])
            zone_score = zone_triple_similarity(a["zones"], b["zones"])
            shape_score = _scalar_similarity(float(a["shape_area"]), float(b["shape_area"]))
            sim = float(0.44 * side_score + 0.24 * area_score + 0.22 * zone_score + 0.10 * shape_score)
            candidates.append((sim, i, j))
    candidates.sort(reverse=True)
    used1: set[int] = set()
    used2: set[int] = set()
    sims: list[float] = []
    for sim, i, j in candidates:
        if i in used1 or j in used2:
            continue
        if sim < 0.60:
            continue
        used1.add(i)
        used2.add(j)
        sims.append(sim)
        if len(sims) >= 16:
            break
    if not sims:
        score = 0.0
    else:
        robust = float(np.mean(sorted(sims)[max(0, int(len(sims) * 0.20)) :]))
        score = 100.0 * robust * min(1.0, len(sims) / 9.0)
    coverage = float(len(sims) / max(1, min(len(fp1), len(fp2), 16)))
    return {
        "rotation_invariant_triangle_score": float(score),
        "rotation_invariant_triangle_matches": int(len(sims)),
        "rotation_invariant_triangle_coverage": coverage,
    }


def estimate_best_transform(
    regions1: list[Region],
    regions2: list[Region],
    max_rotation_degrees: float = 40.0,
    prefer_anatomical_rotation: bool = True,
) -> tuple[np.ndarray | None, list[dict[str, Any]]]:
    n1 = min(14, len(regions1))
    n2 = min(14, len(regions2))
    if n1 < 2 or n2 < 2:
        return None, assign_regions(regions1, regions2, None)
    best_mat = None
    best_matches: list[dict[str, Any]] = []
    best_key = (-1.0, -1.0)
    pts1 = np.array([r.centroid_norm for r in regions1[:n1]], dtype=np.float64)
    pts2 = np.array([r.centroid_norm for r in regions2[:n2]], dtype=np.float64)
    for i in range(n1):
        for k in range(i + 1, n1):
            d1 = np.linalg.norm(pts1[i] - pts1[k])
            if d1 < 0.08:
                continue
            for j in range(n2):
                for l in range(j + 1, n2):
                    d2 = np.linalg.norm(pts2[j] - pts2[l])
                    if d2 < 0.08:
                        continue
                    ratio = d2 / max(d1, EPS)
                    if ratio < 0.55 or ratio > 1.85:
                        continue
                    mat = similarity_from_pairs(np.array([pts1[i], pts1[k]]), np.array([pts2[j], pts2[l]]))
                    if mat is None:
                        continue
                    anatomy = anatomical_transform_metrics(mat)
                    if abs(anatomy["rotation_degrees"]) > max_rotation_degrees or anatomy["scale"] < 0.62 or anatomy["scale"] > 1.62:
                        continue
                    matches = assign_regions(regions1, regions2, mat)
                    wsum = sum(m["weight"] * m["shape_similarity"] * (0.55 + 0.45 * m.get("constellation_similarity", 0.5)) for m in matches)
                    mederr = np.median([m["reprojection_error_norm"] for m in matches]) if matches else 9.0
                    rotation_weight = anatomy["anatomy_penalty"] if prefer_anatomical_rotation else 1.0
                    key = (float(wsum * rotation_weight), float(len(matches) - mederr))
                    if key > best_key:
                        best_key = key
                        best_mat = mat
                        best_matches = matches
    if best_mat is None:
        return None, assign_regions(regions1, regions2, None)
    if len(best_matches) >= 3:
        src = []
        dst = []
        by_id1 = {r.id: r for r in regions1}
        by_id2 = {r.id: r for r in regions2}
        for m in best_matches:
            src.append(by_id1[m["region1_id"]].centroid_norm)
            dst.append(by_id2[m["region2_id"]].centroid_norm)
        refined = similarity_from_pairs(np.array(src, dtype=np.float64), np.array(dst, dtype=np.float64))
        if refined is not None:
            best_mat = refined
            best_matches = assign_regions(regions1, regions2, best_mat)
    return best_mat, best_matches


def estimate_best_affine_transform(regions1: list[Region], regions2: list[Region]) -> tuple[np.ndarray | None, list[dict[str, Any]]]:
    n1 = min(11, len(regions1))
    n2 = min(11, len(regions2))
    if n1 < 3 or n2 < 3:
        return None, assign_regions(regions1, regions2, None)
    best_mat = None
    best_matches: list[dict[str, Any]] = []
    best_key = (-1.0, -1.0)
    pts1 = np.array([r.centroid_norm for r in regions1[:n1]], dtype=np.float64)
    pts2 = np.array([r.centroid_norm for r in regions2[:n2]], dtype=np.float64)
    triples1 = list(itertools.combinations(range(n1), 3))
    triples2 = list(itertools.combinations(range(n2), 3))
    for tri1 in triples1:
        src = pts1[list(tri1)]
        area1 = abs(float(np.cross(src[1] - src[0], src[2] - src[0])))
        if area1 < 0.006:
            continue
        for tri2 in triples2:
            dst = pts2[list(tri2)]
            area2 = abs(float(np.cross(dst[1] - dst[0], dst[2] - dst[0])))
            if area2 < 0.006:
                continue
            ratio = area2 / max(area1, EPS)
            if ratio < 0.18 or ratio > 4.8:
                continue
            mat = affine_from_points(src, dst)
            if mat is None:
                continue
            matches = assign_regions(regions1, regions2, mat, max_dist=0.135)
            if len(matches) < 4:
                continue
            wsum = sum(m["weight"] * m["shape_similarity"] * (0.55 + 0.45 * m.get("constellation_similarity", 0.5)) for m in matches)
            mederr = np.median([m["reprojection_error_norm"] for m in matches]) if matches else 9.0
            key = (float(wsum / (1.0 + 3.0 * mederr)), float(len(matches) - mederr))
            if key > best_key:
                best_key = key
                best_mat = mat
                best_matches = matches
    if best_mat is None:
        return None, assign_regions(regions1, regions2, None)
    if len(best_matches) >= 4:
        by_id1 = {r.id: r for r in regions1}
        by_id2 = {r.id: r for r in regions2}
        src = []
        dst = []
        for m in best_matches:
            src.append(by_id1[m["region1_id"]].centroid_norm)
            dst.append(by_id2[m["region2_id"]].centroid_norm)
        refined = affine_from_points(np.array(src, dtype=np.float64), np.array(dst, dtype=np.float64))
        if refined is not None:
            best_mat = refined
            best_matches = assign_regions(regions1, regions2, best_mat, max_dist=0.135)
    return best_mat, best_matches


def pigment_iou(p1: ProcessedImage, p2: ProcessedImage, mat: np.ndarray | None) -> float:
    if mat is None:
        return 0.0
    yx = np.array(np.nonzero(p1.pigment_mask)).T
    if yx.size == 0 or int(p2.pigment_mask.sum()) == 0:
        return 0.0
    x0, y0, x1, y1 = p1.roi
    u = (yx[:, 1] - x0) / max(1, x1 - x0)
    v = (yx[:, 0] - y0) / max(1, y1 - y0)
    pred = transform_points(np.vstack([u, v]).T.astype(np.float64), mat)
    tx0, ty0, tx1, ty1 = p2.roi
    px = np.round(tx0 + pred[:, 0] * max(1, tx1 - tx0)).astype(np.int32)
    py = np.round(ty0 + pred[:, 1] * max(1, ty1 - ty0)).astype(np.int32)
    h, w = p2.pigment_mask.shape
    ok = (px >= 0) & (px < w) & (py >= 0) & (py < h)
    warped = np.zeros_like(p2.pigment_mask, dtype=bool)
    warped[py[ok], px[ok]] = True
    warped = morph(warped, 1, "dilate")
    inter = int((warped & p2.pigment_mask).sum())
    union = int((warped | p2.pigment_mask).sum())
    return float(inter / union) if union else 0.0


def spatial_spread(matches: list[dict[str, Any]], regions1: list[Region]) -> float:
    if len(matches) < 2:
        return 0.0
    by_id = {r.id: r for r in regions1}
    pts = np.array([by_id[m["region1_id"]].centroid_norm for m in matches if m["region1_id"] in by_id])
    if len(pts) < 2:
        return 0.0
    return float(min(1.0, (pts[:, 0].max() - pts[:, 0].min()) * 1.7) * min(1.0, (pts[:, 1].max() - pts[:, 1].min()) * 1.7))


def tri_zone_match_metrics(matches: list[dict[str, Any]], regions1: list[Region]) -> dict[str, Any]:
    by_id = {r.id: r for r in regions1}
    query_zone_weight = {zone: 0.0 for zone in TRI_ZONES}
    matched_zone_weight = {zone: 0.0 for zone in TRI_ZONES}
    for r in regions1:
        query_zone_weight[r.zone] = query_zone_weight.get(r.zone, 0.0) + r.weight
    for m in matches:
        if m["zone1"] != m["zone2"]:
            continue
        r = by_id.get(m["region1_id"])
        if r is None:
            continue
        matched_zone_weight[r.zone] = matched_zone_weight.get(r.zone, 0.0) + m["weight"] * m["shape_similarity"] * (0.70 + 0.30 * m.get("constellation_similarity", 0.5))

    present_zones = {zone for zone, weight in query_zone_weight.items() if weight > EPS}
    matched_zones = {zone for zone, weight in matched_zone_weight.items() if weight > EPS}
    per_zone_fraction = {
        zone: float(min(1.0, matched_zone_weight.get(zone, 0.0) / max(query_zone_weight.get(zone, 0.0), EPS)))
        for zone in TRI_ZONES
    }
    if present_zones:
        coverage = sum(per_zone_fraction[z] for z in present_zones) / len(present_zones)
    else:
        coverage = 0.0
    if len(matched_zones) >= 3:
        bonus = 1.10
    elif len(matched_zones) == 2:
        bonus = 1.04
    elif len(matched_zones) == 1:
        bonus = 0.94
    else:
        bonus = 0.76
    return {
        "tri_zone_present_count": int(len(present_zones)),
        "tri_zone_matched_count": int(len(matched_zones)),
        "tri_zone_coverage": float(coverage),
        "tri_zone_bonus": float(bonus),
        "tri_zone_matched_weight_fraction": per_zone_fraction,
    }


def primary_region_importance(region: Region) -> float:
    """Weight regions by manta-ID usefulness, not just detected area.

    The primary biological signature is concentrated between/around the gills,
    central/navel belly, and pelvic belly. Wing/margin scatter can help as
    secondary evidence, but long marginal/highlight/shadow regions should not
    drive a match.
    """
    zone_base = {
        "gill_chest": 1.18,
        "central_belly": 1.05,
        "pelvic_belly": 0.92,
    }.get(region.zone, 0.65)
    x, y = region.centroid_norm
    near_margin = x < 0.09 or x > 0.91 or y > 0.88
    border_like = region.aspect >= 3.2 or region.eccentricity >= 0.965
    broad_shadow_like = region.area_norm >= 0.010 and region.eccentricity >= 0.94 and region.contrast < 1.05
    if near_margin and border_like:
        zone_base *= 0.15
    elif near_margin:
        zone_base *= 0.45
    if broad_shadow_like:
        zone_base *= 0.38
    if region.aspect >= 5.0 or region.eccentricity >= 0.985:
        zone_base *= 0.45
    learned = learned_pigment_prior_multiplier(region)
    return float(max(0.05, min(1.35, zone_base * learned)))


@lru_cache(maxsize=2)
def load_pigment_priors(path: str = "") -> dict[str, Any]:
    prior_path = Path(os.environ.get("MANTA_PIGMENT_PRIORS") or path or DEFAULT_PRIOR_PATH)
    if not prior_path.exists():
        return {}
    try:
        payload = json.loads(prior_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if payload.get("prior_version") != "same_catalog_region_stability_v1":
        return {}
    return payload


def learned_pigment_prior_multiplier(region: Region) -> float:
    priors = load_pigment_priors()
    bins = priors.get("bins") if isinstance(priors, dict) else None
    if not isinstance(bins, dict) or not bins:
        return 1.0
    for key in region_prior_keys(region):
        row = bins.get(key)
        if isinstance(row, dict):
            return float(row.get("multiplier") or 1.0)
    return float(priors.get("default_multiplier") or 1.0)


def region_prior_keys(region: Region) -> list[str]:
    x, y = region.centroid_norm
    margin = "margin" if (x < 0.08 or x > 0.92 or y > 0.86) else "interior"
    border = "border" if (region.aspect >= 3.5 or region.eccentricity >= 0.96) else "organic"
    aspect = aspect_bin_for_prior(region.aspect)
    area = area_bin_for_prior(region.area_norm)
    contrast = contrast_bin_for_prior(region.contrast)
    zone = region.zone
    return [
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}|area={area}|contrast={contrast}",
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}|area={area}",
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}",
        f"zone={zone}|margin={margin}|border={border}",
        f"zone={zone}|margin={margin}",
        f"zone={zone}",
    ]


def aspect_bin_for_prior(value: float) -> str:
    if value < 1.6:
        return "compact"
    if value < 2.4:
        return "oval"
    if value < 3.6:
        return "elongated"
    return "linear"


def area_bin_for_prior(value: float) -> str:
    if value < 0.0012:
        return "tiny"
    if value < 0.0035:
        return "small"
    if value < 0.010:
        return "medium"
    if value < 0.025:
        return "large"
    return "huge"


def contrast_bin_for_prior(value: float) -> str:
    if value < 0.75:
        return "low"
    if value < 1.20:
        return "mid"
    return "high"


def primary_match_metrics(matches: list[dict[str, Any]], regions1: list[Region]) -> dict[str, Any]:
    by_id = {r.id: r for r in regions1}
    query_primary_weight = sum(r.weight * primary_region_importance(r) for r in regions1) + EPS
    matched_primary_weight = 0.0
    matched_context_weight = 0.0
    primary_zones: set[str] = set()
    artifact_like_matches = 0
    for m in matches:
        r = by_id.get(m["region1_id"])
        if r is None:
            continue
        importance = primary_region_importance(r)
        same_zone = m["zone1"] == m["zone2"]
        evidence = (
            m["weight"]
            * m["shape_similarity"]
            * (0.62 + 0.38 * m.get("constellation_similarity", 0.5))
            * (1.0 if same_zone else 0.35)
        )
        matched_primary_weight += evidence * importance
        matched_context_weight += evidence * (1.0 - min(1.0, importance / 1.05))
        if same_zone and importance >= 0.70:
            primary_zones.add(r.zone)
        if importance <= 0.25:
            artifact_like_matches += 1
    primary_norm = min(1.0, matched_primary_weight / query_primary_weight)
    context_fraction = matched_context_weight / max(EPS, matched_context_weight + matched_primary_weight)
    if len(primary_zones) >= 3:
        primary_zone_bonus = 1.12
    elif len(primary_zones) == 2:
        primary_zone_bonus = 1.04
    elif len(primary_zones) == 1:
        primary_zone_bonus = 0.90
    else:
        primary_zone_bonus = 0.62
    artifact_match_fraction = artifact_like_matches / max(1, len(matches))
    artifact_penalty = 1.0 - 0.42 * min(1.0, artifact_match_fraction)
    context_penalty = 1.0 - 0.34 * min(1.0, context_fraction)
    return {
        "primary_normalized_weight": float(primary_norm),
        "primary_matched_weight": float(matched_primary_weight),
        "primary_zone_count": int(len(primary_zones)),
        "primary_zone_bonus": float(primary_zone_bonus),
        "artifact_like_match_fraction": float(artifact_match_fraction),
        "context_match_fraction": float(context_fraction),
        "artifact_context_penalty": float(artifact_penalty * context_penalty),
    }


def coarse_signature(proc: ProcessedImage) -> dict[str, Any]:
    """Cheap deterministic descriptor for prefiltering before expensive geometry.

    This deliberately uses summary distributions, not pairwise transforms. It is
    fast enough to run against the whole gallery and broad enough to avoid
    overfitting to one exact pose.
    """
    zones = list(TRI_ZONES)
    zone_weight = {zone: 0.0 for zone in zones}
    zone_area = {zone: 0.0 for zone in zones}
    grid = np.zeros((4, 4), dtype=np.float64)
    total_weight = sum(r.weight for r in proc.regions) + EPS
    total_area = sum(r.area_norm for r in proc.regions) + EPS
    for r in proc.regions:
        zone_weight[r.zone] = zone_weight.get(r.zone, 0.0) + r.weight / total_weight
        zone_area[r.zone] = zone_area.get(r.zone, 0.0) + r.area_norm / total_area
        gx = min(3, max(0, int(r.centroid_norm[0] * 4)))
        gy = min(3, max(0, int(r.centroid_norm[1] * 4)))
        grid[gy, gx] += r.weight / total_weight
    top_regions = sorted(proc.regions, key=lambda r: r.weight, reverse=True)[:12]
    top_area = sorted([r.area_norm for r in top_regions], reverse=True)
    top_aspect = sorted([min(6.0, r.aspect) / 6.0 for r in top_regions], reverse=True)
    return {
        "region_count": len(proc.regions),
        "total_weight": float(total_weight),
        "total_area_norm": float(total_area),
        "zone_weight": zone_weight,
        "zone_area": zone_area,
        "grid": grid.reshape(-1).tolist(),
        "top_area": top_area,
        "top_aspect": top_aspect,
        "body_mask_confidence": float(proc.metrics.get("body_mask_confidence", 0.0)),
    }


def _hist_intersection(a: list[float], b: list[float]) -> float:
    n = max(len(a), len(b))
    if n == 0:
        return 0.0
    aa = list(a) + [0.0] * (n - len(a))
    bb = list(b) + [0.0] * (n - len(b))
    den = max(sum(aa), sum(bb), EPS)
    return float(sum(min(x, y) for x, y in zip(aa, bb)) / den)


def _scalar_similarity(a: float, b: float) -> float:
    return float(min(a + EPS, b + EPS) / max(a + EPS, b + EPS))


def coarse_match_score(p1: ProcessedImage, p2: ProcessedImage) -> float:
    a = coarse_signature(p1)
    b = coarse_signature(p2)
    zones = list(TRI_ZONES)
    zone_weight_score = _hist_intersection([a["zone_weight"].get(z, 0.0) for z in zones], [b["zone_weight"].get(z, 0.0) for z in zones])
    zone_area_score = _hist_intersection([a["zone_area"].get(z, 0.0) for z in zones], [b["zone_area"].get(z, 0.0) for z in zones])
    grid_score = _hist_intersection(a["grid"], b["grid"])
    area_score = _hist_intersection(a["top_area"], b["top_area"])
    aspect_score = _hist_intersection(a["top_aspect"], b["top_aspect"])
    count_score = _scalar_similarity(float(a["region_count"]), float(b["region_count"]))
    confidence_score = min(float(a["body_mask_confidence"]), float(b["body_mask_confidence"]))
    return float(
        100.0
        * (0.24 * zone_weight_score + 0.16 * zone_area_score + 0.26 * grid_score + 0.18 * area_score + 0.08 * aspect_score + 0.08 * count_score)
        * (0.55 + 0.45 * confidence_score)
    )


def zone_region_signature(proc: ProcessedImage, zone: str) -> dict[str, Any]:
    """Cheap zone-specific descriptor for candidate retrieval.

    The global coarse score can miss true resights when one anatomical zone is
    distorted or poorly lit. This descriptor lets retrieval nominate candidates
    independently from the gill/chest, central belly, and pelvic regions.
    """
    regions = [r for r in proc.regions if r.zone == zone]
    total_weight = sum(r.weight for r in proc.regions) + EPS
    zone_weight = sum(r.weight for r in regions)
    zone_area = sum(r.area_norm for r in regions)
    xhist = np.zeros(5, dtype=np.float64)
    yhist = np.zeros(3, dtype=np.float64)
    area_hist = np.zeros(5, dtype=np.float64)
    aspect_hist = np.zeros(4, dtype=np.float64)
    if regions:
        den = sum(r.weight for r in regions) + EPS
        for r in regions:
            x = min(4, max(0, int(r.centroid_norm[0] * 5)))
            y = min(2, max(0, int((r.centroid_norm[1] % (1.0 / 3.0)) * 9)))
            xhist[x] += r.weight / den
            yhist[y] += r.weight / den
            area_bin = min(4, max(0, int(math.log10(max(r.area_norm, EPS) * 100000.0 + 1.0))))
            aspect_bin = min(3, max(0, int(min(3.99, r.aspect - 1.0))))
            area_hist[area_bin] += r.weight / den
            aspect_hist[aspect_bin] += r.weight / den
    top = sorted(regions, key=lambda r: r.weight, reverse=True)[:8]
    return {
        "count": len(regions),
        "weight_fraction": float(zone_weight / total_weight),
        "area": float(zone_area),
        "xhist": xhist.tolist(),
        "yhist": yhist.tolist(),
        "area_hist": area_hist.tolist(),
        "aspect_hist": aspect_hist.tolist(),
        "top_area": sorted([r.area_norm for r in top], reverse=True),
        "top_contrast": sorted([min(5.0, r.contrast) / 5.0 for r in top], reverse=True),
    }


def zone_match_score(p1: ProcessedImage, p2: ProcessedImage, zone: str) -> float:
    a = zone_region_signature(p1, zone)
    b = zone_region_signature(p2, zone)
    if int(a["count"]) == 0 or int(b["count"]) == 0:
        return 0.0
    count_score = _scalar_similarity(float(a["count"]), float(b["count"]))
    weight_score = _scalar_similarity(float(a["weight_fraction"]), float(b["weight_fraction"]))
    area_score = _scalar_similarity(float(a["area"]), float(b["area"]))
    x_score = _hist_intersection(a["xhist"], b["xhist"])
    y_score = _hist_intersection(a["yhist"], b["yhist"])
    area_hist_score = _hist_intersection(a["area_hist"], b["area_hist"])
    aspect_score = _hist_intersection(a["aspect_hist"], b["aspect_hist"])
    top_area_score = _hist_intersection(a["top_area"], b["top_area"])
    contrast_score = _hist_intersection(a["top_contrast"], b["top_contrast"])
    presence = min(1.0, float(a["count"]) / 2.0) * min(1.0, float(b["count"]) / 2.0)
    return float(
        100.0
        * presence
        * (
            0.10 * count_score
            + 0.10 * weight_score
            + 0.12 * area_score
            + 0.18 * x_score
            + 0.08 * y_score
            + 0.14 * area_hist_score
            + 0.08 * aspect_score
            + 0.14 * top_area_score
            + 0.06 * contrast_score
        )
    )


def prefilter_scores(p1: ProcessedImage, p2: ProcessedImage) -> dict[str, float]:
    scores = {"coarse_score": coarse_match_score(p1, p2)}
    for zone in TRI_ZONES:
        scores[f"{zone}_score"] = zone_match_score(p1, p2, zone)
    scores["best_zone_score"] = max(scores[f"{zone}_score"] for zone in TRI_ZONES)
    scores["relaxed_geometry_score"] = relaxed_geometry_retrieval_score(p1, p2)
    invariant = rotation_invariant_constellation_score(p1.regions, p2.regions)
    scores["rotation_invariant_constellation_score"] = float(invariant["rotation_invariant_constellation_score"])
    triangles = rotation_invariant_triangle_score(p1.regions, p2.regions)
    scores["rotation_invariant_triangle_score"] = float(triangles["rotation_invariant_triangle_score"])
    scores["retrieval_score"] = max(
        scores["coarse_score"],
        scores["best_zone_score"],
        scores["relaxed_geometry_score"],
        scores["rotation_invariant_constellation_score"],
        scores["rotation_invariant_triangle_score"],
    )
    return scores


def blended_final_score(exact_score: float, coarse_score: float, coarse_weight: float = 0.20, coarse_bonus_cap: float = 8.0) -> float:
    """Rank score with coarse retrieval as a capped tie-breaker.

    Coarse descriptors are good at nominating candidates but too blunt to be a
    final judge. Without a cap, high coarse similarity can overpower stronger
    pigment-region geometry, which is exactly the failure mode seen in the
    Photo 3800 case pack.
    """
    coarse_bonus = max(0.0, float(coarse_weight) * max(0.0, float(coarse_score)))
    return float(exact_score) + min(float(coarse_bonus_cap), coarse_bonus)


def select_multipass_prefilter(
    rows: list[dict[str, Any]],
    global_top_n: int = 120,
    zone_top_n: int = 80,
    relaxed_top_n: int = 180,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Select a union of global and zone-specific retrieval candidates."""
    if global_top_n <= 0 and zone_top_n <= 0 and relaxed_top_n <= 0:
        return list(rows), {
            "prefilter_mode": "full",
            "global_top_n": int(global_top_n),
            "zone_top_n": int(zone_top_n),
            "relaxed_top_n": int(relaxed_top_n),
            "selected_count": len(rows),
            "selected_by_pass": {"full": len(rows)},
        }

    selected: dict[str, dict[str, Any]] = {}
    selected_by_pass: dict[str, int] = {}

    def add_pass(name: str, ranked: list[dict[str, Any]], limit: int) -> None:
        if limit <= 0:
            return
        count_before = len(selected)
        for row in ranked[:limit]:
            key = str(row.get("photo_id") or row.get("image_path") or id(row))
            selected.setdefault(key, row)
        selected_by_pass[name] = len(selected) - count_before

    add_pass("global", sorted(rows, key=lambda row: float(row.get("coarse_score") or 0.0), reverse=True), global_top_n)
    add_pass("relaxed_geometry", sorted(rows, key=lambda row: float(row.get("relaxed_geometry_score") or 0.0), reverse=True), relaxed_top_n)
    for zone in TRI_ZONES:
        field = f"{zone}_score"
        add_pass(zone, sorted(rows, key=lambda row: float(row.get(field) or 0.0), reverse=True), zone_top_n)

    out = list(selected.values())
    out.sort(key=lambda row: float(row.get("retrieval_score") or row.get("coarse_score") or 0.0), reverse=True)
    return out, {
        "prefilter_mode": "multipass_zone_union",
        "global_top_n": int(global_top_n),
        "zone_top_n": int(zone_top_n),
        "relaxed_top_n": int(relaxed_top_n),
        "selected_count": len(out),
        "selected_by_pass": selected_by_pass,
    }


def relaxed_geometry_retrieval_score(p1: ProcessedImage, p2: ProcessedImage) -> float:
    """Fast layout score used only for retrieval.

    Full matching tries many transform hypotheses and is too expensive for every
    catalog candidate. This pass keeps the useful part for retrieval: same-zone
    pigment regions with similar relative positions, sizes, and shapes.
    """
    matches = assign_regions(p1.regions[:22], p2.regions[:22], None, max_dist=0.22)
    same_zone = [m for m in matches if m["zone1"] == m["zone2"]]
    if not same_zone:
        return 0.0
    total_query_weight = sum(r.weight for r in p1.regions) + EPS
    matched_weight = sum(m["weight"] * m["shape_similarity"] * (0.60 + 0.40 * m.get("constellation_similarity", 0.5)) for m in same_zone)
    zones = {m["zone1"] for m in same_zone}
    spread = spatial_spread(same_zone, p1.regions)
    mederr = float(np.median([m["reprojection_error_norm"] for m in same_zone])) if same_zone else 1.0
    count_factor = min(1.0, len(same_zone) / 7.0)
    zone_factor = 0.72 + 0.10 * min(3, len(zones))
    weight_fraction = min(1.0, matched_weight / total_query_weight)
    return float(100.0 * weight_fraction * (0.35 + 0.65 * count_factor) * zone_factor * (0.60 + 0.40 * spread) / (1.0 + 2.5 * mederr))


def support_match_metrics(p1: ProcessedImage, p2: ProcessedImage) -> dict[str, Any]:
    """Capped broad-body support score.

    Broad regions are deliberately not allowed to decide identity. They can
    confirm a central match when both masks are clean and the support spots are
    coherent, but the bonus is small enough that wing scatter cannot overpower
    the primary chest/belly signature.
    """
    q_quality = float(p1.metrics.get("support_cutout_quality") or 0.0)
    c_quality = float(p2.metrics.get("support_cutout_quality") or 0.0)
    quality = min(q_quality, c_quality)
    if quality < 0.62 or len(p1.support_regions) < 4 or len(p2.support_regions) < 4:
        return {
            "support_bonus": 0.0,
            "support_match_count": 0,
            "support_score": 0.0,
            "support_cutout_quality_min": float(quality),
            "support_reason": "disabled_or_insufficient_regions",
        }

    matches = assign_regions(p1.support_regions[:30], p2.support_regions[:30], None, max_dist=0.20)
    same_zone = [m for m in matches if m["zone1"] == m["zone2"]]
    if len(same_zone) < 3:
        return {
            "support_bonus": 0.0,
            "support_match_count": len(same_zone),
            "support_score": 0.0,
            "support_cutout_quality_min": float(quality),
            "support_reason": "too_few_same_zone_support_matches",
        }

    total_weight = sum(r.weight for r in p1.support_regions) + EPS
    matched_weight = sum(
        m["weight"] * m["shape_similarity"] * (0.55 + 0.45 * m.get("constellation_similarity", 0.5))
        for m in same_zone
    )
    weight_fraction = min(1.0, matched_weight / total_weight)
    zones = {m["zone1"] for m in same_zone}
    spread = spatial_spread(same_zone, p1.support_regions)
    mederr = float(np.median([m["reprojection_error_norm"] for m in same_zone])) if same_zone else 1.0
    constellation = matched_constellation_metrics(same_zone, p1.support_regions, p2.support_regions)
    support_score = float(
        100.0
        * quality
        * weight_fraction
        * min(1.0, len(same_zone) / 8.0)
        * (0.70 + 0.10 * min(3, len(zones)))
        * (0.65 + 0.35 * spread)
        * float(constellation["matched_constellation_bonus"])
        / (1.0 + 2.8 * mederr)
    )
    # Hard cap by design: support can break ties and lift plausible matches,
    # but it cannot beat a poor primary central signature by itself.
    support_bonus = min(7.5, 0.18 * support_score)
    return {
        "support_bonus": float(support_bonus),
        "support_match_count": int(len(same_zone)),
        "support_score": support_score,
        "support_weight_fraction": float(weight_fraction),
        "support_spatial_spread": float(spread),
        "support_median_reprojection_error_norm": mederr,
        "support_zone_count": int(len(zones)),
        "support_cutout_quality_min": float(quality),
        "support_reason": "capped_broad_body_bonus",
        **{f"support_{k}": v for k, v in constellation.items()},
    }


def large_region_negative_evidence(
    p1: ProcessedImage,
    p2: ProcessedImage,
    matches: list[dict[str, Any]],
) -> dict[str, Any]:
    """Penalty for leaving important pigment regions unexplained.

    Earlier scoring could rank a wrong manta too highly when a few local spot
    pairs lined up. For ID work, large central/chest/pelvic pigment regions are
    not optional evidence: if they are present in either image and the proposed
    alignment does not account for them, confidence should drop.
    """
    matched1 = {int(m["region1_id"]) for m in matches}
    matched2 = {int(m["region2_id"]) for m in matches}

    def important_regions(regions: list[Region]) -> list[Region]:
        primary = [r for r in regions if r.zone in TRI_ZONES]
        if not primary:
            primary = list(regions)
        ranked = sorted(
            primary,
            key=lambda r: (
                r.weight * (1.0 + 2.5 * min(0.012, max(0.0, r.area_norm)) / 0.012),
                r.area_norm,
            ),
            reverse=True,
        )
        return ranked[: min(10, len(ranked))]

    def coverage(regions: list[Region], matched: set[int]) -> tuple[float, float, int, int]:
        important = important_regions(regions)
        if not important:
            return 0.0, 0.0, 0, 0
        weights = [max(EPS, r.weight) for r in important]
        total = float(sum(weights) + EPS)
        matched_weight = float(sum(w for r, w in zip(important, weights) if r.id in matched))
        large = [r for r in important if r.area_norm >= 0.0025 or r.weight >= 0.55]
        large_matched = [r for r in large if r.id in matched]
        return matched_weight / total, len(large_matched) / max(1, len(large)), len(large), len(important)

    q_weight_cov, q_large_cov, q_large_count, q_important_count = coverage(p1.regions, matched1)
    c_weight_cov, c_large_cov, c_large_count, c_important_count = coverage(p2.regions, matched2)

    # Query coverage matters most because we are asking "does this candidate
    # explain the photo in hand?", but unmatched large candidate marks are also
    # negative evidence against identity.
    weighted_coverage = 0.62 * q_weight_cov + 0.23 * c_weight_cov + 0.15 * min(q_large_cov, c_large_cov)
    large_region_penalty = 0.48 + 0.52 * max(0.0, min(1.0, weighted_coverage))

    # Do not over-penalize truly sparse signatures; those should already carry
    # low score from region_penalty. Stronger penalties apply only when there
    # was enough pigment evidence available to explain.
    if q_important_count < 4 or c_important_count < 4:
        large_region_penalty = max(large_region_penalty, 0.82)
    if q_large_count == 0 and c_large_count == 0:
        large_region_penalty = max(large_region_penalty, 0.90)

    return {
        "large_region_penalty": float(large_region_penalty),
        "query_important_region_coverage": float(q_weight_cov),
        "candidate_important_region_coverage": float(c_weight_cov),
        "query_large_region_coverage": float(q_large_cov),
        "candidate_large_region_coverage": float(c_large_cov),
        "query_large_region_count": int(q_large_count),
        "candidate_large_region_count": int(c_large_count),
        "query_important_region_count": int(q_important_count),
        "candidate_important_region_count": int(c_important_count),
    }


def regional_consistency_metrics(
    p1: ProcessedImage,
    p2: ProcessedImage,
    matches: list[dict[str, Any]],
) -> dict[str, Any]:
    """Explain whether different ROI regions agree independently.

    This intentionally keeps large center markings intact by assigning each
    region to one sector from its centroid instead of cutting masks into hard
    tiles. The goal is not a new decision rule yet; it gives us inspectable
    evidence for cases where one side of the manta matches but another side
    contradicts it.
    """
    matched1 = {int(m["region1_id"]) for m in matches}
    matched2 = {int(m["region2_id"]) for m in matches}

    def sector(region: Region) -> str:
        x, y = region.centroid_norm
        if 0.38 <= x <= 0.62:
            side = "center"
        elif x < 0.38:
            side = "left"
        else:
            side = "right"
        band = "upper" if y < 0.50 else "lower"
        return f"{side}_{band}"

    def coverage(regions: list[Region], matched: set[int]) -> tuple[dict[str, float], dict[str, float]]:
        weights: dict[str, float] = {}
        matched_weights: dict[str, float] = {}
        for r in regions:
            if r.zone not in TRI_ZONES:
                continue
            s = sector(r)
            w = r.weight * primary_region_importance(r)
            weights[s] = weights.get(s, 0.0) + w
            if r.id in matched:
                matched_weights[s] = matched_weights.get(s, 0.0) + w
        total = sum(weights.values()) + EPS
        fractions = {k: float(v / total) for k, v in sorted(weights.items())}
        coverages = {
            k: float(min(1.0, matched_weights.get(k, 0.0) / max(v, EPS)))
            for k, v in sorted(weights.items())
        }
        return fractions, coverages

    q_fraction, q_coverage = coverage(p1.regions, matched1)
    c_fraction, c_coverage = coverage(p2.regions, matched2)
    important_query_sectors = [s for s, f in q_fraction.items() if f >= 0.14]
    important_candidate_sectors = [s for s, f in c_fraction.items() if f >= 0.14]
    q_values = [q_coverage.get(s, 0.0) for s in important_query_sectors]
    c_values = [c_coverage.get(s, 0.0) for s in important_candidate_sectors]
    all_values = q_values + c_values
    if all_values:
        regional_min = float(min(all_values))
        regional_mean = float(sum(all_values) / len(all_values))
        regional_imbalance = float(max(all_values) - min(all_values))
    else:
        regional_min = 0.0
        regional_mean = 0.0
        regional_imbalance = 0.0
    red_flags: list[str] = []
    for s in important_query_sectors:
        if q_coverage.get(s, 0.0) < 0.22:
            red_flags.append(f"weak_query_sector:{s}")
    for s in important_candidate_sectors:
        if c_coverage.get(s, 0.0) < 0.22:
            red_flags.append(f"weak_candidate_sector:{s}")
    if regional_imbalance >= 0.70 and regional_min < 0.25:
        red_flags.append("one_region_drives_match")
    return {
        "regional_query_weight_fraction": q_fraction,
        "regional_query_coverage": q_coverage,
        "regional_candidate_weight_fraction": c_fraction,
        "regional_candidate_coverage": c_coverage,
        "regional_min_coverage": regional_min,
        "regional_mean_coverage": regional_mean,
        "regional_imbalance": regional_imbalance,
        "regional_red_flags": red_flags,
    }


def orientation_normalized_regional_metrics(p1: ProcessedImage, p2: ProcessedImage) -> dict[str, Any]:
    """Compare regional pigment layout after normalizing the spot-cloud frame.

    This is deliberately separate from the raw anatomical ROI sectors. It asks
    whether the same *partial pattern* exists after removing rotation, axis
    flips, and the wide/tall ROI coordinate bias that shows up in parallaxed
    or sideways catalog photos.
    """

    def descriptor(regions: list[Region]) -> dict[str, Any]:
        primary = [r for r in regions if r.zone in TRI_ZONES]
        if len(primary) < 4:
            primary = list(regions)
        ranked = sorted(primary, key=lambda r: r.weight * primary_region_importance(r), reverse=True)[:24]
        if len(ranked) < 4:
            return {"usable": False, "sectors": {}, "top_area": [], "count": len(ranked)}
        pts = np.array([r.centroid_norm for r in ranked], dtype=np.float64)
        weights = np.array([max(EPS, r.weight * primary_region_importance(r)) for r in ranked], dtype=np.float64)
        center = (pts * weights[:, None]).sum(axis=0) / weights.sum()
        centered = pts - center
        cov = (centered * weights[:, None]).T @ centered / weights.sum()
        try:
            vals, vecs = np.linalg.eigh(cov)
        except np.linalg.LinAlgError:
            return {"usable": False, "sectors": {}, "top_area": [], "count": len(ranked)}
        order = np.argsort(vals)[::-1]
        vals = vals[order]
        vecs = vecs[:, order]
        norm = centered @ vecs
        scales = np.sqrt(np.maximum(vals, 0.0025))
        norm = norm / scales
        # Clip extreme parallax outliers so one distant wing spot does not own
        # the regional bins.
        norm = np.clip(norm, -2.2, 2.2)
        items = []
        for r, pt, w in zip(ranked, norm, weights):
            items.append(
                {
                    "x": float(pt[0]),
                    "y": float(pt[1]),
                    "weight": float(w),
                    "area": float(r.area_norm),
                    "contrast": float(r.contrast),
                    "shape": float(min(1.0, 1.0 / max(1.0, r.aspect / 2.2))),
                }
            )
        return {
            "usable": True,
            "items": items,
            "top_area": sorted([float(r.area_norm) for r in ranked[:10]], reverse=True),
            "top_contrast": sorted([float(min(4.0, r.contrast) / 4.0) for r in ranked[:10]], reverse=True),
            "count": len(ranked),
        }

    def sector_for(x: float, y: float) -> str:
        if x < -0.48:
            sx = "left"
        elif x > 0.48:
            sx = "right"
        else:
            sx = "center"
        sy = "upper" if y < 0.0 else "lower"
        return f"{sx}_{sy}"

    def sectorize(desc: dict[str, Any], mode: str) -> dict[str, Any]:
        sectors: dict[str, float] = {}
        areas: dict[str, list[float]] = {}
        for item in desc.get("items", []):
            x = float(item["x"])
            y = float(item["y"])
            if "swap" in mode:
                x, y = y, x
            if "flipx" in mode:
                x = -x
            if "flipy" in mode:
                y = -y
            s = sector_for(x, y)
            sectors[s] = sectors.get(s, 0.0) + float(item["weight"])
            areas.setdefault(s, []).append(float(item["area"]))
        total = sum(sectors.values()) + EPS
        sectors = {k: float(v / total) for k, v in sectors.items()}
        top_by_sector = {k: sorted(v, reverse=True)[:5] for k, v in areas.items()}
        return {"sectors": sectors, "top_by_sector": top_by_sector}

    d1 = descriptor(p1.regions)
    d2 = descriptor(p2.regions)
    if not d1.get("usable") or not d2.get("usable"):
        return {
            "orientation_normalized_regional_score": 0.0,
            "orientation_normalized_regional_mode": "unusable",
            "orientation_normalized_region_count_min": int(min(d1.get("count", 0), d2.get("count", 0))),
            "orientation_normalized_sector_score": 0.0,
            "orientation_normalized_area_score": 0.0,
            "orientation_normalized_count_score": 0.0,
        }
    base = sectorize(d1, "identity")
    modes = [
        "identity",
        "flipx",
        "flipy",
        "flipx_flipy",
        "swap",
        "swap_flipx",
        "swap_flipy",
        "swap_flipx_flipy",
    ]
    best: dict[str, Any] | None = None
    for mode in modes:
        cand = sectorize(d2, mode)
        keys = sorted(set(base["sectors"]) | set(cand["sectors"]))
        sector_score = _hist_intersection([base["sectors"].get(k, 0.0) for k in keys], [cand["sectors"].get(k, 0.0) for k in keys])
        area_scores = []
        for k in keys:
            a = base["top_by_sector"].get(k, [])
            b = cand["top_by_sector"].get(k, [])
            if a or b:
                area_scores.append(_hist_intersection(a, b))
        area_score = float(sum(area_scores) / len(area_scores)) if area_scores else 0.0
        global_area = _hist_intersection(d1["top_area"], d2["top_area"])
        contrast_score = _hist_intersection(d1["top_contrast"], d2["top_contrast"])
        count_score = _scalar_similarity(float(d1["count"]), float(d2["count"]))
        score = 100.0 * (
            0.38 * sector_score
            + 0.26 * area_score
            + 0.18 * global_area
            + 0.10 * contrast_score
            + 0.08 * count_score
        )
        row = {
            "orientation_normalized_regional_score": float(score),
            "orientation_normalized_regional_mode": mode,
            "orientation_normalized_region_count_min": int(min(d1["count"], d2["count"])),
            "orientation_normalized_sector_score": float(sector_score),
            "orientation_normalized_area_score": float(area_score),
            "orientation_normalized_global_area_score": float(global_area),
            "orientation_normalized_contrast_score": float(contrast_score),
            "orientation_normalized_count_score": float(count_score),
        }
        if best is None or row["orientation_normalized_regional_score"] > best["orientation_normalized_regional_score"]:
            best = row
    return best or {}


def score_match_with_transform(
    p1: ProcessedImage,
    p2: ProcessedImage,
    max_rotation_degrees: float = 40.0,
    prefer_anatomical_rotation: bool = True,
    match_mode: str = "standard",
) -> dict[str, Any]:
    if match_mode == "affine_rescue":
        mat, matches = estimate_best_affine_transform(p1.regions, p2.regions)
    else:
        mat, matches = estimate_best_transform(
            p1.regions,
            p2.regions,
            max_rotation_degrees=max_rotation_degrees,
            prefer_anatomical_rotation=prefer_anatomical_rotation,
        )
    zone_relaxed = match_mode in {"orientation_rescue", "affine_rescue"}
    scoring_matches = [
        {**m, "zone2": m["zone1"]} if zone_relaxed else m
        for m in matches
    ]
    total_query_weight = sum(r.weight for r in p1.regions) + EPS
    matched_weight = sum(m["weight"] * m["shape_similarity"] * (0.55 + 0.45 * m.get("constellation_similarity", 0.5)) for m in scoring_matches)
    norm_weight = matched_weight / total_query_weight
    errors = [m["reprojection_error_norm"] for m in scoring_matches]
    mederr = float(np.median(errors)) if errors else 1.0
    zones = {m["zone1"] for m in scoring_matches if m["zone1"] == m["zone2"]}
    zone_consistency = (sum(1 for m in scoring_matches if m["zone1"] == m["zone2"]) / len(scoring_matches)) if scoring_matches else 0.0
    zone_bonus = 0.72 + 0.14 * min(3, len(zones))
    tri_zone = tri_zone_match_metrics(scoring_matches, p1.regions)
    primary = primary_match_metrics(scoring_matches, p1.regions)
    spread = spatial_spread(scoring_matches, p1.regions)
    constellation_values = [float(m.get("constellation_similarity", 0.5)) for m in scoring_matches]
    constellation_score = float(np.mean(constellation_values)) if constellation_values else 0.0
    constellation_floor = min(constellation_values) if constellation_values else 0.0
    matched_constellation = matched_constellation_metrics(scoring_matches, p1.regions, p2.regions)
    if len(scoring_matches) >= 5:
        constellation_bonus = 0.62 + 0.58 * constellation_score
    elif len(scoring_matches) >= 3:
        constellation_bonus = 0.70 + 0.42 * constellation_score
    else:
        constellation_bonus = 0.66 + 0.30 * constellation_score
    constellation_bonus *= float(matched_constellation["matched_constellation_bonus"])
    spread_bonus = 0.65 + 0.45 * spread
    iou = pigment_iou(p1, p2, mat)
    overlap_quality = 0.15 + 0.85 * min(1.0, iou / 0.22)
    if mederr <= 0.025:
        alignment_quality = 1.18
    elif mederr <= 0.035:
        alignment_quality = 1.08
    elif mederr <= 0.050:
        alignment_quality = 0.96
    elif mederr <= 0.070:
        alignment_quality = 0.78
    else:
        alignment_quality = 0.55
    mask_conf = min(float(p1.metrics.get("body_mask_confidence", 0.0)), float(p2.metrics.get("body_mask_confidence", 0.0)))
    region_penalty = min(1.0, len(p1.regions) / 5.0) * min(1.0, len(p2.regions) / 5.0)
    anatomy = anatomical_transform_metrics(mat)
    anatomy_penalty = 0.88 if match_mode == "affine_rescue" else anatomy["anatomy_penalty"]
    score = (
        100.0
        * region_penalty
        * (0.68 * primary["primary_normalized_weight"] + 0.18 * norm_weight + 0.14 * iou)
        * math.log1p(len(scoring_matches))
        * zone_bonus
        * tri_zone["tri_zone_bonus"]
        * primary["primary_zone_bonus"]
        * (0.92 + 0.08 * tri_zone["tri_zone_coverage"])
        * spread_bonus
        * constellation_bonus
        * overlap_quality
        * alignment_quality
        * (0.62 + 0.38 * zone_consistency)
        * primary["artifact_context_penalty"]
        * anatomy_penalty
        * (0.45 + 0.55 * mask_conf)
        / (1.0 + 4.6 * mederr)
    )
    support = support_match_metrics(p1, p2)
    primary_score = float(score)
    invariant = rotation_invariant_constellation_score(p1.regions, p2.regions)
    triangles = rotation_invariant_triangle_score(p1.regions, p2.regions)
    negative = large_region_negative_evidence(p1, p2, scoring_matches)
    regional = regional_consistency_metrics(p1, p2, scoring_matches)
    orientation_regional = orientation_normalized_regional_metrics(p1, p2)
    invariant_bonus = 0.0
    if int(triangles["rotation_invariant_triangle_matches"]) >= 4:
        invariant_bonus += min(5.5, 0.075 * float(triangles["rotation_invariant_triangle_score"]))
    if int(invariant["rotation_invariant_constellation_pair_matches"]) >= 7:
        invariant_bonus += min(2.0, 0.025 * float(invariant["rotation_invariant_constellation_score"]))
    invariant_bonus_raw = float(invariant_bonus)
    if iou < 0.050:
        invariant_bonus = min(invariant_bonus, 2.0)
    elif iou < 0.090:
        invariant_bonus = min(invariant_bonus, 4.5)
    invariant_bonus *= 0.72 + 0.28 * float(negative["large_region_penalty"])
    score = (primary_score + float(support["support_bonus"]) + invariant_bonus) * float(negative["large_region_penalty"])
    return {
        "score": float(score),
        "primary_score": float(primary_score),
        **support,
        **invariant,
        **triangles,
        **negative,
        **regional,
        **orientation_regional,
        "rotation_invariant_constellation_bonus": float(invariant_bonus),
        "rotation_invariant_constellation_bonus_raw": float(invariant_bonus_raw),
        "match_count": len(matches),
        "matched_weight": float(matched_weight),
        "normalized_weighted_regions": float(norm_weight),
        "pigment_iou": float(iou),
        "overlap_quality": float(overlap_quality),
        "median_reprojection_error_norm": mederr,
        "alignment_quality": float(alignment_quality),
        "spatial_spread": spread,
        "constellation_score": float(constellation_score),
        "constellation_floor": float(constellation_floor),
        "constellation_bonus": float(constellation_bonus),
        **matched_constellation,
        "zone_count": len(zones),
        "zone_consistency": float(zone_consistency),
        "zone_bonus": float(zone_bonus),
        **tri_zone,
        **primary,
        "spread_bonus": float(spread_bonus),
        "transform_rotation_degrees": anatomy["rotation_degrees"],
        "transform_scale": anatomy["scale"],
        "anatomy_penalty": float(anatomy_penalty),
        "body_mask_confidence_min": float(mask_conf),
        "orientation_match_mode": match_mode,
        "orientation_zone_relaxed": bool(zone_relaxed),
        "transform": mat.tolist() if mat is not None else None,
        "matches": matches,
    }


def score_match(p1: ProcessedImage, p2: ProcessedImage) -> dict[str, Any]:
    standard = score_match_with_transform(p1, p2, match_mode="standard")
    invariant_strength = max(
        float(standard.get("rotation_invariant_constellation_score") or 0.0),
        float(standard.get("rotation_invariant_triangle_score") or 0.0),
    )
    standard_score = float(standard.get("score") or 0.0)
    should_try_rescue = standard_score < 35.0 or invariant_strength >= 82.0
    if not should_try_rescue:
        standard["orientation_rescue_attempted"] = False
        standard["orientation_rescue_used"] = False
        standard["orientation_rescue_score"] = 0.0
        return standard

    rescue = score_match_with_transform(
        p1,
        p2,
        max_rotation_degrees=125.0,
        prefer_anatomical_rotation=False,
        match_mode="orientation_rescue",
    )
    rescue_rotation = abs(float(rescue.get("transform_rotation_degrees") or 0.0))
    rescue_score = float(rescue.get("score") or 0.0)
    standard["orientation_rescue_attempted"] = True
    standard["orientation_rescue_used"] = False
    standard["orientation_rescue_score"] = rescue_score
    standard["orientation_rescue_rotation_degrees"] = float(rescue.get("transform_rotation_degrees") or 0.0)

    # Use the rotated frame only for obvious orientation disagreements. This
    # prevents ordinary upright false positives from gaining another broad
    # search path, while rescuing curated photos that were left sideways.
    if rescue_rotation >= 50.0 and rescue_score >= max(standard_score + 6.0, standard_score * 1.18):
        rescue["orientation_rescue_attempted"] = True
        rescue["orientation_rescue_used"] = True
        rescue["orientation_rescue_score"] = rescue_score
        rescue["orientation_rescue_standard_score"] = standard_score
        return rescue
    standard["affine_rescue_attempted"] = True
    standard["affine_rescue_used"] = False
    standard["affine_rescue_score"] = 0.0
    if ENABLE_AFFINE_RESCUE:
        affine = score_match_with_transform(p1, p2, match_mode="affine_rescue")
        affine_score = float(affine.get("score") or 0.0)
        standard["affine_rescue_score"] = affine_score
        if affine_score >= max(standard_score + 8.0, standard_score * 1.22):
            affine["orientation_rescue_attempted"] = True
            affine["orientation_rescue_used"] = False
            affine["orientation_rescue_score"] = rescue_score
            affine["orientation_rescue_standard_score"] = standard_score
            affine["affine_rescue_attempted"] = True
            affine["affine_rescue_used"] = True
            affine["affine_rescue_score"] = affine_score
            affine["affine_rescue_standard_score"] = standard_score
            return affine
    return standard


def anatomical_transform_metrics(mat: np.ndarray | None) -> dict[str, float]:
    if mat is None:
        return {"rotation_degrees": 0.0, "scale": 0.0, "anatomy_penalty": 0.35}
    a = mat[:2, :2]
    scale = float(math.sqrt(max(EPS, abs(np.linalg.det(a)))))
    angle = float(math.degrees(math.atan2(a[0, 1], a[0, 0])))
    angle_abs = abs(angle)
    if angle_abs <= 12.0:
        rotation_penalty = 1.0
    elif angle_abs <= 25.0:
        rotation_penalty = 0.75
    elif angle_abs <= 35.0:
        rotation_penalty = 0.50
    else:
        rotation_penalty = 0.28

    if 0.82 <= scale <= 1.22:
        scale_penalty = 1.0
    elif 0.68 <= scale <= 1.45:
        scale_penalty = 0.70
    else:
        scale_penalty = 0.45

    return {
        "rotation_degrees": angle,
        "scale": scale,
        "anatomy_penalty": float(rotation_penalty * scale_penalty),
    }


def image_from_gray(a: np.ndarray) -> Image.Image:
    b = np.clip(a, 0, 255).astype(np.uint8)
    return Image.fromarray(b, mode="L").convert("RGB")


def overlay_mask(rgb: np.ndarray, mask: np.ndarray, color: tuple[int, int, int], alpha: float = 0.35) -> Image.Image:
    base = Image.fromarray(rgb).convert("RGBA")
    ov = Image.new("RGBA", base.size, (0, 0, 0, 0))
    arr = np.asarray(ov).copy()
    arr[mask] = (*color, int(255 * alpha))
    return Image.alpha_composite(base, Image.fromarray(arr, "RGBA")).convert("RGB")


def draw_regions(proc: ProcessedImage) -> Image.Image:
    img = overlay_mask(proc.image, proc.pigment_mask, (255, 70, 40), 0.35)
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = proc.roi
    draw.rectangle([x0, y0, x1, y1], outline=(255, 220, 0), width=3)
    for r in proc.regions:
        bx0, by0, bx1, by1 = r.bbox
        color = (0, 255, 120) if r.zone == "gill_chest" else (0, 180, 255) if r.zone == "central_belly" else (255, 140, 0)
        draw.rectangle([bx0, by0, bx1, by1], outline=color, width=2)
        cx, cy = r.centroid
        draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=color)
        draw.text((cx + 4, cy + 4), str(r.id), fill=color)
    return img


def draw_rejected_regions(proc: ProcessedImage) -> Image.Image:
    img = Image.fromarray(proc.image).convert("RGB")
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = proc.roi
    draw.rectangle([x0, y0, x1, y1], outline=(255, 220, 0), width=3)
    reason_colors = {
        "thin_linear_anatomical_edge": (255, 40, 40),
        "gill_or_fin_line_candidate": (255, 120, 0),
        "gill_slit_like_edge": (255, 0, 180),
        "margin_or_fin_border": (180, 0, 255),
        "touches_roi_boundary": (255, 220, 0),
        "too_small_speckle": (140, 140, 140),
        "too_large_region": (255, 255, 255),
    }
    for idx, r in enumerate(proc.rejected_regions, 1):
        bx0, by0, bx1, by1 = r.bbox
        color = reason_colors.get(r.reason, (255, 80, 80))
        draw.rectangle([bx0, by0, bx1, by1], outline=color, width=2)
        cx, cy = r.centroid
        draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=color)
        if idx <= 40:
            draw.text((cx + 4, cy + 4), r.reason[:10], fill=color)
    title = f"rejected={len(proc.rejected_regions)} {proc.metrics.get('rejected_region_reasons', {})}"
    draw.rectangle([0, 0, min(img.width, 900), 24], fill=(0, 0, 0))
    draw.text((8, 5), title, fill=(255, 255, 255))
    return img


def draw_support_regions(proc: ProcessedImage) -> Image.Image:
    img = Image.fromarray(proc.image).convert("RGB")
    draw = ImageDraw.Draw(img)
    support_roi = proc.metrics.get("support_roi") or []
    if isinstance(support_roi, list) and len(support_roi) == 4:
        draw.rectangle([int(v) for v in support_roi], outline=(170, 90, 255), width=3)
    for r in proc.support_regions:
        bx0, by0, bx1, by1 = r.bbox
        color = (190, 80, 255) if r.zone == "gill_chest" else (255, 90, 190) if r.zone == "central_belly" else (255, 150, 60)
        draw.rectangle([bx0, by0, bx1, by1], outline=color, width=2)
        cx, cy = r.centroid
        draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=color)
        draw.text((cx + 4, cy + 4), str(r.id), fill=color)
    title = f"support={len(proc.support_regions)} policy={proc.metrics.get('support_roi_policy', '')} quality={float(proc.metrics.get('support_cutout_quality') or 0.0):.2f}"
    draw.rectangle([0, 0, min(img.width, 900), 24], fill=(0, 0, 0))
    draw.text((8, 5), title, fill=(255, 255, 255))
    return img


def _draw_line_from_center(
    draw: ImageDraw.ImageDraw,
    center: list[float] | tuple[float, float],
    angle_degrees: float,
    length: float,
    color: tuple[int, int, int],
    width: int = 4,
) -> None:
    cx, cy = float(center[0]), float(center[1])
    theta = math.radians(angle_degrees)
    dx = math.cos(theta) * length * 0.5
    dy = math.sin(theta) * length * 0.5
    draw.line([cx - dx, cy - dy, cx + dx, cy + dy], fill=color, width=width)


def draw_orientation_landmarks(proc: ProcessedImage) -> Image.Image:
    img = Image.fromarray(proc.image).convert("RGB")
    img = overlay_mask(np.asarray(img), proc.body_mask, (30, 220, 255), 0.16)
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = proc.roi
    draw.rectangle([x0, y0, x1, y1], outline=(255, 220, 0), width=3)
    metrics = proc.metrics
    h, w = proc.gray.shape
    line_len = max(90.0, min(w, h) * 0.34)

    head_center = metrics.get("head_front_center") or metrics.get("landmark_head_center")
    head_angle = metrics.get("head_front_angle_degrees")
    if isinstance(head_center, list) and len(head_center) == 2 and head_angle is not None:
        _draw_line_from_center(draw, head_center, float(head_angle), line_len, (255, 80, 80), 5)
        draw.ellipse(
            [float(head_center[0]) - 5, float(head_center[1]) - 5, float(head_center[0]) + 5, float(head_center[1]) + 5],
            fill=(255, 80, 80),
        )
        draw.text((float(head_center[0]) + 7, float(head_center[1]) + 7), "head/front", fill=(255, 80, 80))

    landmark_head = metrics.get("landmark_head_center")
    landmark_tail = metrics.get("landmark_tail_tip")
    if (
        isinstance(landmark_head, list)
        and isinstance(landmark_tail, list)
        and len(landmark_head) == 2
        and len(landmark_tail) == 2
    ):
        draw.line(
            [float(landmark_head[0]), float(landmark_head[1]), float(landmark_tail[0]), float(landmark_tail[1])],
            fill=(80, 255, 120),
            width=5,
        )
        draw.ellipse(
            [float(landmark_tail[0]) - 6, float(landmark_tail[1]) - 6, float(landmark_tail[0]) + 6, float(landmark_tail[1]) + 6],
            fill=(80, 255, 120),
        )
        label = "tail/body axis"
        if bool(metrics.get("landmark_tail_tip_used")):
            label = "tail-tip axis"
        draw.text((float(landmark_tail[0]) + 7, float(landmark_tail[1]) + 7), label, fill=(80, 255, 120))

    frame = metrics.get("body_frame") or metrics.get("canonical_body_frame")
    if isinstance(frame, dict):
        center = frame.get("center")
        head_tail = frame.get("head_tail_axis")
        lateral = frame.get("lateral_axis")
        if isinstance(center, list) and isinstance(head_tail, list):
            angle = math.degrees(math.atan2(float(head_tail[1]), float(head_tail[0])))
            _draw_line_from_center(draw, center, angle, line_len * 1.15, (90, 160, 255), 3)
            draw.text((float(center[0]) + 8, float(center[1]) - 20), "body axis", fill=(90, 160, 255))
        if isinstance(center, list) and isinstance(lateral, list):
            angle = math.degrees(math.atan2(float(lateral[1]), float(lateral[0])))
            _draw_line_from_center(draw, center, angle, line_len * 1.05, (190, 90, 255), 2)

    title = (
        f"orientation={metrics.get('canonical_orientation_method', metrics.get('orientation_normalized', ''))} "
        f"rot={float(metrics.get('orientation_rotation_applied_degrees') or 0.0):.1f} "
        f"front={float(metrics.get('head_front_angle_degrees') or 0.0):.1f} "
        f"axis={float(metrics.get('canonical_axis_rotation_degrees') or 0.0):.1f}"
    )
    draw.rectangle([0, 0, min(img.width, 1100), 30], fill=(0, 0, 0))
    draw.text((8, 8), title, fill=(255, 255, 255))
    legend = "red=head/front line  green=head-to-tail cue  blue=body axis  purple=lateral axis  yellow=ROI"
    draw.rectangle([0, img.height - 28, min(img.width, 1200), img.height], fill=(0, 0, 0))
    draw.text((8, img.height - 21), legend, fill=(255, 255, 255))
    return img


def draw_pair_overlay(p1: ProcessedImage, p2: ProcessedImage, result: dict[str, Any]) -> Image.Image:
    left = draw_regions(p1)
    right = draw_regions(p2)
    h = max(left.height, right.height)
    out = Image.new("RGB", (left.width + right.width, h), (15, 15, 15))
    out.paste(left, (0, 0))
    out.paste(right, (left.width, 0))
    draw = ImageDraw.Draw(out)
    r1 = {r.id: r for r in p1.regions}
    r2 = {r.id: r for r in p2.regions}
    for m in result["matches"]:
        a = r1.get(m["region1_id"])
        b = r2.get(m["region2_id"])
        if not a or not b:
            continue
        ax, ay = a.centroid
        bx, by = b.centroid
        bx += left.width
        err = m["reprojection_error_norm"]
        color = (40, 255, 100) if err < 0.06 else (255, 210, 40)
        draw.line([ax, ay, bx, by], fill=color, width=2)
    title = f"score={result['score']:.2f} primary={result.get('primary_score', result['score']):.2f} support+={result.get('support_bonus', 0.0):.2f} matches={result['match_count']} iou={result['pigment_iou']:.3f}"
    draw.rectangle([0, 0, min(out.width, 760), 24], fill=(0, 0, 0))
    draw.text((8, 5), title, fill=(255, 255, 255))
    return out


def save_debug(proc: ProcessedImage, out_dir: Path, prefix: str) -> dict[str, str]:
    ensure_dir(out_dir)
    paths = {
        "original": out_dir / f"{prefix}_01_original.png",
        "body_mask": out_dir / f"{prefix}_02_body_mask.png",
        "body_cutout": out_dir / f"{prefix}_03_body_cutout.png",
        "body_overlay": out_dir / f"{prefix}_04_body_overlay.png",
        "roi_overlay": out_dir / f"{prefix}_05_roi_overlay.png",
        "spotness": out_dir / f"{prefix}_06_spotness.png",
        "enhanced_gray": out_dir / f"{prefix}_06b_enhanced_gray.png",
        "pigment_mask": out_dir / f"{prefix}_07_pigment_mask.png",
        "regions": out_dir / f"{prefix}_08_regions.png",
        "rejected_regions": out_dir / f"{prefix}_09_rejected_regions.png",
        "support_regions": out_dir / f"{prefix}_10_support_regions.png",
        "orientation_landmarks": out_dir / f"{prefix}_11_orientation_landmarks.png",
        "regions_json": out_dir / f"{prefix}_regions.json",
    }
    Image.fromarray(proc.image).save(paths["original"])
    Image.fromarray((proc.body_mask.astype(np.uint8) * 255), mode="L").save(paths["body_mask"])
    cut = proc.image.copy()
    cut[~proc.body_mask] = 0
    Image.fromarray(cut).save(paths["body_cutout"])
    overlay_mask(proc.image, proc.body_mask, (30, 220, 255), 0.28).save(paths["body_overlay"])
    roi_img = overlay_mask(cut, proc.roi_mask, (255, 220, 0), 0.20)
    ImageDraw.Draw(roi_img).rectangle(proc.roi, outline=(255, 220, 0), width=3)
    roi_img.save(paths["roi_overlay"])
    image_from_gray(proc.spotness / max(float(proc.spotness.max()), 1.0) * 255.0).save(paths["spotness"])
    image_from_gray(proc.gray).save(paths["enhanced_gray"])
    Image.fromarray((proc.pigment_mask.astype(np.uint8) * 255), mode="L").save(paths["pigment_mask"])
    draw_regions(proc).save(paths["regions"])
    draw_rejected_regions(proc).save(paths["rejected_regions"])
    draw_support_regions(proc).save(paths["support_regions"])
    draw_orientation_landmarks(proc).save(paths["orientation_landmarks"])
    paths["regions_json"].write_text(
        json.dumps(
            {
                "path": proc.path,
                "metrics": proc.metrics,
                "regions": [asdict(r) for r in proc.regions],
                "support_regions": [asdict(r) for r in proc.support_regions],
                "rejected_regions": [asdict(r) for r in proc.rejected_regions],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return {k: str(v) for k, v in paths.items()}


def parse_roi(value: str | None) -> tuple[int, int, int, int] | None:
    if not value:
        return None
    parts = [int(p.strip()) for p in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("ROI must be x0,y0,x1,y1")
    return tuple(parts)  # type: ignore[return-value]


def match_pair(
    image1: str | Path,
    image2: str | Path,
    out_dir: str | Path,
    long_edge: int = DEFAULT_LONG_EDGE,
    roi1: tuple[int, int, int, int] | None = None,
    roi2: tuple[int, int, int, int] | None = None,
    write_debug: bool = True,
    enhance: bool = False,
) -> dict[str, Any]:
    p1 = process_image(image1, long_edge, roi1, enhance=enhance)
    p2 = process_image(image2, long_edge, roi2, enhance=enhance)
    result = score_match(p1, p2)
    out = Path(out_dir)
    ensure_dir(out)
    debug_paths: dict[str, Any] = {}
    if write_debug:
        debug_paths["image1"] = save_debug(p1, out / "image1", "image1")
        debug_paths["image2"] = save_debug(p2, out / "image2", "image2")
        pair_path = out / "pair_overlay.png"
        draw_pair_overlay(p1, p2, result).save(pair_path)
        debug_paths["pair_overlay"] = str(pair_path)
    payload = {
        "image1": str(image1),
        "image2": str(image2),
        "image1_metrics": p1.metrics,
        "image2_metrics": p2.metrics,
        "image1_region_count": len(p1.regions),
        "image2_region_count": len(p2.regions),
        "result": result,
        "debug_paths": debug_paths,
    }
    (out / "match_summary.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def find_image_by_photo_id(search_roots: Iterable[str | Path], photo_id: str) -> str | None:
    names = [
        f"{photo_id}.jpg",
        f"{photo_id}.jpeg",
        f"{photo_id}.png",
        f"photos-{photo_id}-{photo_id}.jpg",
        f"{photo_id}_{photo_id}.jpg",
    ]
    for root in search_roots:
        rootp = Path(root)
        if not rootp.exists():
            continue
        manifest = rootp / "manifest.csv"
        if manifest.exists():
            try:
                with open(manifest, newline="", encoding="utf-8") as f:
                    for row in csv.DictReader(f):
                        if str(row.get("pk_photo_id", "")).strip() == str(photo_id):
                            filename = row.get("output_filename", "")
                            candidate = rootp / filename
                            if filename and candidate.exists():
                                return str(candidate)
            except Exception:
                pass
        for name in names:
            hits = list(rootp.rglob(name))
            if hits:
                return str(hits[0])
        hits = list(rootp.rglob(f"*{photo_id}*.jpg"))
        if hits:
            return str(hits[0])
    return None


def build_catalog_from_manifest(manifest: str | Path, image_dir: str | Path) -> list[dict[str, str]]:
    rows = []
    with open(manifest, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            filename = row.get("output_filename", "")
            path = str(Path(image_dir) / filename)
            if not filename or not Path(path).exists():
                continue
            rows.append(
                {
                    "catalog_id": row.get("fk_catalog_id") or row.get("pk_catalog_id") or "",
                    "photo_id": row.get("pk_photo_id") or "",
                    "image_path": path,
                    "label": filename,
                }
            )
    return rows


def rank_catalog(query: str | Path, anchors: list[dict[str, str]], out_dir: str | Path, top_k: int = 25, long_edge: int = DEFAULT_LONG_EDGE) -> dict[str, Any]:
    out = Path(out_dir)
    ensure_dir(out)
    q = process_image(query, long_edge)
    save_debug(q, out / "query_debug", "query")
    results = []
    for idx, anchor in enumerate(anchors, 1):
        try:
            a = process_image(anchor["image_path"], long_edge)
            scored = score_match(q, a)
            results.append({**anchor, **{k: v for k, v in scored.items() if k != "matches" and k != "transform"}, "matches": scored["matches"]})
            print(f"[{idx}/{len(anchors)}] catalog={anchor.get('catalog_id')} photo={anchor.get('photo_id')} score={scored['score']:.2f}", flush=True)
        except Exception as exc:
            results.append({**anchor, "score": 0.0, "error": str(exc)})
            print(f"[{idx}/{len(anchors)}] ERROR {anchor.get('image_path')}: {exc}", flush=True)
    results.sort(key=lambda r: float(r.get("score", 0.0)), reverse=True)
    top = results[:top_k]
    (out / f"top{top_k}.json").write_text(json.dumps(top, indent=2), encoding="utf-8")
    with open(out / "ranking.csv", "w", newline="", encoding="utf-8") as f:
        fields = ["rank", "catalog_id", "photo_id", "score", "match_count", "normalized_weighted_regions", "pigment_iou", "median_reprojection_error_norm", "spatial_spread", "zone_count", "image_path"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for rank, row in enumerate(results, 1):
            writer.writerow({field: row.get(field, rank if field == "rank" else "") for field in fields})
    return {"query": str(query), "top_k": top_k, "results": top, "csv": str(out / "ranking.csv")}


def main() -> None:
    parser = argparse.ArgumentParser(description="Pairwise manta pigment-region matcher")
    parser.add_argument("image1")
    parser.add_argument("image2")
    parser.add_argument("--out-dir", default="scripts/matching/output/pair")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--roi1", type=parse_roi, default=None)
    parser.add_argument("--roi2", type=parse_roi, default=None)
    parser.add_argument("--enhance", action="store_true", help="Use experimental deterministic pigment enhancement before segmentation.")
    args = parser.parse_args()
    payload = match_pair(args.image1, args.image2, args.out_dir, args.long_edge, args.roi1, args.roi2, enhance=args.enhance)
    print(json.dumps(payload["result"], indent=2))
    print(f"summary: {Path(args.out_dir) / 'match_summary.json'}")
    print(f"overlay: {payload['debug_paths'].get('pair_overlay')}")


if __name__ == "__main__":
    main()
