#!/usr/bin/env python3
"""Analyze repeatable pigment-region signal within known same-catalog resights.

The goal is to separate stable identity signal from unstable artifacts. For a
catalog ID with several known best-manta ventral photos, true pigment regions
should repeatedly match across same-animal pairs despite lighting/parallax.
Regions that rarely match, especially elongated or margin-adjacent ones, are
good candidates for future down-weighting or rejection.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from eval_resight_rank import read_queries
from pigment_region_matcher import (
    DEFAULT_LONG_EDGE,
    ProcessedImage,
    draw_pair_overlay,
    ensure_dir,
    load_or_create_signature,
    score_match,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze same-individual pigment-region consistency.")
    parser.add_argument("--queries-csv", default="export/best_manta_ventral_photos_100/manifest.csv")
    parser.add_argument("--out-dir", default="scripts/matching/output/within_catalog_consistency")
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--catalog-id", action="append", default=[], help="Catalog ID to analyze. May be repeated.")
    parser.add_argument("--min-photos", type=int, default=3)
    parser.add_argument("--max-catalogs", type=int, default=6)
    parser.add_argument("--max-photos-per-catalog", type=int, default=8)
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument("--write-overlays", type=int, default=2, help="Write N lowest-score same-catalog pair overlays per catalog.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    ensure_dir(out_dir)
    rows = read_queries(args.queries_csv)
    groups = group_queries(rows)
    selected = select_groups(groups, args.catalog_id, args.min_photos, args.max_catalogs)
    if not selected:
        raise SystemExit("No catalog groups met the selection criteria.")

    all_catalog_summaries: list[dict[str, Any]] = []
    all_pair_rows: list[dict[str, Any]] = []
    all_region_rows: list[dict[str, Any]] = []

    for catalog_id, photos in selected:
        photos = photos[: args.max_photos_per_catalog]
        catalog_dir = out_dir / f"catalog_{catalog_id}"
        ensure_dir(catalog_dir)
        print(f"[catalog {catalog_id}] processing {len(photos)} same-animal photos", flush=True)
        processed = load_group(photos, args)
        pair_rows, region_rows = analyze_catalog(catalog_id, processed, catalog_dir, args.write_overlays)
        summary = summarize_catalog(catalog_id, processed, pair_rows, region_rows)
        all_catalog_summaries.append(summary)
        all_pair_rows.extend(pair_rows)
        all_region_rows.extend(region_rows)
        write_csv(catalog_dir / "pair_scores.csv", pair_rows)
        write_csv(catalog_dir / "region_stability.csv", region_rows)
        (catalog_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    write_csv(out_dir / "catalog_summary.csv", all_catalog_summaries)
    write_csv(out_dir / "pair_scores.csv", all_pair_rows)
    write_csv(out_dir / "region_stability.csv", all_region_rows)
    payload = {
        "catalogs_analyzed": len(all_catalog_summaries),
        "catalog_summaries": all_catalog_summaries,
        "outputs": {
            "catalog_summary_csv": str(out_dir / "catalog_summary.csv"),
            "pair_scores_csv": str(out_dir / "pair_scores.csv"),
            "region_stability_csv": str(out_dir / "region_stability.csv"),
        },
    }
    (out_dir / "summary.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2), flush=True)


def group_queries(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        catalog_id = str(row.get("catalog_id") or row.get("fk_catalog_id") or "")
        image_path = str(row.get("image_path") or "")
        if catalog_id and image_path:
            groups[catalog_id].append(row)
    for photos in groups.values():
        photos.sort(key=lambda row: int(str(row.get("photo_id") or "0").split(".")[0] or 0))
    return dict(groups)


def select_groups(
    groups: dict[str, list[dict[str, str]]],
    catalog_ids: list[str],
    min_photos: int,
    max_catalogs: int,
) -> list[tuple[str, list[dict[str, str]]]]:
    if catalog_ids:
        return [(cid, groups[cid]) for cid in catalog_ids if cid in groups and len(groups[cid]) >= min_photos]
    candidates = [(cid, photos) for cid, photos in groups.items() if len(photos) >= min_photos]
    candidates.sort(key=lambda item: (-len(item[1]), int(item[0]) if item[0].isdigit() else 999999))
    return candidates[:max_catalogs]


def load_group(rows: list[dict[str, str]], args: argparse.Namespace) -> list[dict[str, Any]]:
    loaded: list[dict[str, Any]] = []
    for row in rows:
        proc, _, from_cache = load_or_create_signature(row, args.cache_dir, args.long_edge, args.refresh_cache)
        print(
            f"  photo={row.get('photo_id')} {'cache' if from_cache else 'processed'} regions={len(proc.regions)}",
            flush=True,
        )
        loaded.append({**row, "processed": proc})
    return loaded


def analyze_catalog(
    catalog_id: str,
    photos: list[dict[str, Any]],
    out_dir: Path,
    write_overlays: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    pair_rows: list[dict[str, Any]] = []
    match_counts: dict[str, Counter[int]] = {str(p["photo_id"]): Counter() for p in photos}
    opportunities: dict[str, int] = {str(p["photo_id"]): 0 for p in photos}
    pair_payloads: list[tuple[float, dict[str, Any], dict[str, Any], dict[str, Any]]] = []

    for i, left in enumerate(photos):
        p1: ProcessedImage = left["processed"]
        opportunities[str(left["photo_id"])] += max(0, len(photos) - 1)
        for right in photos[i + 1 :]:
            p2: ProcessedImage = right["processed"]
            result = score_match(p1, p2)
            for match in result["matches"]:
                match_counts[str(left["photo_id"])][int(match["region1_id"])] += 1
                match_counts[str(right["photo_id"])][int(match["region2_id"])] += 1
            row = {
                "catalog_id": catalog_id,
                "photo_id_1": left.get("photo_id"),
                "photo_id_2": right.get("photo_id"),
                "score": result["score"],
                "match_count": result["match_count"],
                "pigment_iou": result["pigment_iou"],
                "median_reprojection_error_norm": result["median_reprojection_error_norm"],
                "spatial_spread": result["spatial_spread"],
                "zone_count": result["zone_count"],
                "zone_consistency": result["zone_consistency"],
                "constellation_score": result["constellation_score"],
                "tri_zone_coverage": result["tri_zone_coverage"],
                "query_regions_1": len(p1.regions),
                "query_regions_2": len(p2.regions),
                "quality_flags_1": "|".join(p1.metrics.get("signature_quality_flags", [])),
                "quality_flags_2": "|".join(p2.metrics.get("signature_quality_flags", [])),
            }
            pair_rows.append(row)
            pair_payloads.append((float(result["score"]), left, right, result))

    pair_payloads.sort(key=lambda item: item[0])
    for idx, (_, left, right, result) in enumerate(pair_payloads[: max(0, write_overlays)], 1):
        overlay_path = out_dir / f"low_pair_{idx}_photo_{left.get('photo_id')}_vs_{right.get('photo_id')}.png"
        draw_pair_overlay(left["processed"], right["processed"], result).save(overlay_path)

    region_rows: list[dict[str, Any]] = []
    rows_by_photo: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for photo in photos:
        photo_id = str(photo["photo_id"])
        proc: ProcessedImage = photo["processed"]
        denom = max(1, opportunities[photo_id])
        for region in proc.regions:
            stability = match_counts[photo_id][region.id] / denom
            x, y = region.centroid_norm
            row = {
                "catalog_id": catalog_id,
                "photo_id": photo_id,
                "region_id": region.id,
                "stability": stability,
                "matched_pairs": match_counts[photo_id][region.id],
                "pair_opportunities": denom,
                "zone": region.zone,
                "centroid_x": x,
                "centroid_y": y,
                "area_norm": region.area_norm,
                "weight": region.weight,
                "aspect": region.aspect,
                "eccentricity": region.eccentricity,
                "contrast": region.contrast,
                "near_side_or_pelvic_margin": bool(x < 0.08 or x > 0.92 or y > 0.86),
                "border_like": bool(region.aspect >= 3.5 or region.eccentricity >= 0.96),
            }
            region_rows.append(row)
            rows_by_photo[photo_id].append(row)
    for photo in photos:
        photo_id = str(photo["photo_id"])
        overlay_path = out_dir / f"photo_{photo_id}_stability_overlay.png"
        draw_stability_overlay(photo["processed"], rows_by_photo[photo_id]).save(overlay_path)
    return pair_rows, region_rows


def draw_stability_overlay(proc: ProcessedImage, rows: list[dict[str, Any]]) -> Image.Image:
    """Draw stable regions in green, unstable artifact-like regions in red."""
    img = Image.fromarray(proc.image).convert("RGB")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    by_region = {int(row["region_id"]): row for row in rows}
    x0, y0, x1, y1 = proc.roi
    draw.rectangle([x0, y0, x1, y1], outline=(255, 210, 0, 230), width=3)
    for region in proc.regions:
        row = by_region.get(region.id, {})
        stability = float(row.get("stability") or 0.0)
        border_like = bool(row.get("border_like")) or bool(row.get("near_side_or_pelvic_margin"))
        if stability >= 0.50:
            fill = (0, 210, 90, 90)
            outline = (0, 255, 120, 255)
        elif stability >= 0.25:
            fill = (255, 200, 0, 70)
            outline = (255, 220, 0, 255)
        elif border_like:
            fill = (255, 40, 40, 90)
            outline = (255, 40, 40, 255)
        else:
            fill = (80, 160, 255, 55)
            outline = (40, 170, 255, 220)
        pts = region.contour
        if len(pts) >= 3:
            draw.polygon(pts, fill=fill, outline=outline)
        bx0, by0, bx1, by1 = region.bbox
        draw.rectangle([bx0, by0, bx1, by1], outline=outline, width=2)
        cx, cy = region.centroid
        draw.text((cx + 3, cy + 3), f"{region.id}:{stability:.1f}", fill=outline)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def summarize_catalog(
    catalog_id: str,
    photos: list[dict[str, Any]],
    pair_rows: list[dict[str, Any]],
    region_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    scores = [float(row["score"]) for row in pair_rows]
    stable = [row for row in region_rows if float(row["stability"]) >= 0.34]
    unstable_border = [
        row
        for row in region_rows
        if float(row["stability"]) <= 0.10 and (row["border_like"] or row["near_side_or_pelvic_margin"])
    ]
    zone_counter = Counter(str(row["zone"]) for row in stable)
    return {
        "catalog_id": catalog_id,
        "photo_count": len(photos),
        "pair_count": len(pair_rows),
        "median_same_catalog_score": percentile(scores, 50),
        "min_same_catalog_score": min(scores) if scores else 0.0,
        "max_same_catalog_score": max(scores) if scores else 0.0,
        "stable_region_count": len(stable),
        "unstable_border_like_region_count": len(unstable_border),
        "stable_gill_chest_regions": zone_counter.get("gill_chest", 0),
        "stable_central_belly_regions": zone_counter.get("central_belly", 0),
        "stable_pelvic_belly_regions": zone_counter.get("pelvic_belly", 0),
    }


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    idx = (len(values) - 1) * pct / 100.0
    lo = int(idx)
    hi = min(len(values) - 1, lo + 1)
    frac = idx - lo
    return float(values[lo] * (1.0 - frac) + values[hi] * frac)


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_dir(path.parent)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
