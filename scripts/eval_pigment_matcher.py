#!/usr/bin/env python3
"""Evaluate the deterministic pigment-region matcher on curated pairs."""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MATCHING_DIR = SCRIPT_DIR / "matching"
sys.path.insert(0, str(MATCHING_DIR))

from pigment_region_matcher import DEFAULT_LONG_EDGE, find_image_by_photo_id, match_pair  # noqa: E402


CATALOG_464 = ["4700", "4878", "4882", "4922", "4975", "4981", "4994", "4997", "5069", "5074", "5224", "6545"]
NEGATIVES = ["6004", "6011"]


def default_pairs() -> list[dict[str, str]]:
    pairs: list[dict[str, str]] = []
    for a, b in itertools.combinations(CATALOG_464, 2):
        pairs.append({"label": f"positive_464_{a}_vs_{b}", "photo1": a, "photo2": b, "expected": "positive"})
    pairs.append({"label": "negative_6004_vs_6011", "photo1": "6004", "photo2": "6011", "expected": "negative"})
    for n in NEGATIVES:
        for p in CATALOG_464:
            pairs.append({"label": f"negative_{n}_vs_464_{p}", "photo1": n, "photo2": p, "expected": "negative"})
    return pairs


def load_pairs(path: Path) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    required = {"photo1", "photo2", "expected"}
    missing = required - set(rows[0].keys() if rows else [])
    if missing:
        raise SystemExit(f"Pair CSV missing columns: {sorted(missing)}")
    for i, row in enumerate(rows, 1):
        row.setdefault("label", f"pair_{i}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch evaluation for pigment-region manta matcher")
    parser.add_argument("--image-root", action="append", default=[], help="Directory to search for photo IDs. Can be repeated.")
    parser.add_argument("--pairs-csv", default=None, help="Optional CSV with label,photo1,photo2,expected columns.")
    parser.add_argument("--out-dir", default="scripts/matching/output/eval")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--debug-limit", type=int, default=20, help="Write full debug images for the first N runnable pairs.")
    args = parser.parse_args()

    roots = [Path(p) for p in args.image_root]
    if not roots:
        roots = [
            Path("resight/resight_radiation/anchor_cache"),
            Path("resight/resight_radiation"),
            Path("export/best_catalog_photos"),
            Path("."),
        ]

    pairs = load_pairs(Path(args.pairs_csv)) if args.pairs_csv else default_pairs()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    failures = []
    runnable_index = 0

    for pair in pairs:
        p1 = find_image_by_photo_id(roots, pair["photo1"])
        p2 = find_image_by_photo_id(roots, pair["photo2"])
        if not p1 or not p2:
            failures.append({**pair, "image1": p1, "image2": p2, "failure": "missing_image"})
            print(f"SKIP {pair['label']}: missing image(s) {pair['photo1']}={p1} {pair['photo2']}={p2}", flush=True)
            continue
        runnable_index += 1
        pair_out = out_dir / "debug" / pair["label"]
        write_debug = runnable_index <= args.debug_limit
        payload = match_pair(p1, p2, pair_out, args.long_edge, write_debug=write_debug)
        result = payload["result"]
        row = {
            "label": pair["label"],
            "expected": pair["expected"],
            "photo1": pair["photo1"],
            "photo2": pair["photo2"],
            "image1": p1,
            "image2": p2,
            "score": result["score"],
            "match_count": result["match_count"],
            "normalized_weighted_regions": result["normalized_weighted_regions"],
            "pigment_iou": result["pigment_iou"],
            "median_reprojection_error_norm": result["median_reprojection_error_norm"],
            "spatial_spread": result["spatial_spread"],
            "zone_count": result["zone_count"],
            "image1_region_count": payload["image1_region_count"],
            "image2_region_count": payload["image2_region_count"],
            "debug_overlay": payload["debug_paths"].get("pair_overlay", ""),
        }
        rows.append(row)
        print(f"{pair['expected'].upper()} {pair['label']} score={result['score']:.2f} matches={result['match_count']} iou={result['pigment_iou']:.3f}", flush=True)

    csv_path = out_dir / "eval_results.csv"
    fields = [
        "label",
        "expected",
        "photo1",
        "photo2",
        "score",
        "match_count",
        "normalized_weighted_regions",
        "pigment_iou",
        "median_reprojection_error_norm",
        "spatial_spread",
        "zone_count",
        "image1_region_count",
        "image2_region_count",
        "debug_overlay",
        "image1",
        "image2",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    positives = [float(r["score"]) for r in rows if r["expected"] == "positive"]
    negatives = [float(r["score"]) for r in rows if r["expected"] == "negative"]
    summary = {
        "pair_count": len(pairs),
        "runnable_count": len(rows),
        "failure_count": len(failures),
        "positive_count": len(positives),
        "negative_count": len(negatives),
        "positive_scores": positives,
        "negative_scores": negatives,
        "positive_min": min(positives) if positives else None,
        "positive_median": sorted(positives)[len(positives) // 2] if positives else None,
        "negative_max": max(negatives) if negatives else None,
        "negative_median": sorted(negatives)[len(negatives) // 2] if negatives else None,
        "separation_margin": (min(positives) - max(negatives)) if positives and negatives else None,
        "failures": failures,
        "csv": str(csv_path),
    }
    (out_dir / "eval_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
