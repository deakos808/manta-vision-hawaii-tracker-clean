#!/usr/bin/env python3
"""Rank a query manta image against local catalog anchor photos."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from pigment_region_matcher import DEFAULT_LONG_EDGE, build_catalog_from_manifest, rank_catalog


def load_anchor_csv(path: Path) -> list[dict[str, str]]:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            image_path = row.get("image_path") or row.get("path") or row.get("filename")
            if not image_path:
                continue
            rows.append(
                {
                    "catalog_id": row.get("catalog_id") or row.get("fk_catalog_id") or row.get("pk_catalog_id") or "",
                    "photo_id": row.get("photo_id") or row.get("pk_photo_id") or "",
                    "image_path": image_path,
                    "label": row.get("label") or Path(image_path).name,
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Catalog-wide ranking with deterministic pigment-region matcher")
    parser.add_argument("query_image")
    parser.add_argument("--anchors-csv", default=None, help="CSV with image_path/path/filename plus optional catalog_id/photo_id.")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv", help="Best catalog photo manifest.")
    parser.add_argument("--image-dir", default="export/best_catalog_photos", help="Directory for manifest output_filename images.")
    parser.add_argument("--out-dir", default="scripts/matching/output/rank")
    parser.add_argument("--top-k", type=int, default=25)
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--limit", type=int, default=0, help="Optional first-N anchor limit for smoke tests.")
    args = parser.parse_args()

    if args.anchors_csv:
        anchors = load_anchor_csv(Path(args.anchors_csv))
    else:
        anchors = build_catalog_from_manifest(args.manifest, args.image_dir)
    if args.limit > 0:
        anchors = anchors[: args.limit]
    if not anchors:
        raise SystemExit("No anchors found. Provide --anchors-csv or check --manifest/--image-dir.")
    payload = rank_catalog(args.query_image, anchors, args.out_dir, args.top_k, args.long_edge)
    print(f"ranking_csv: {payload['csv']}")
    for i, row in enumerate(payload["results"], 1):
        print(f"{i:02d} catalog={row.get('catalog_id')} photo={row.get('photo_id')} score={float(row.get('score', 0.0)):.2f} image={row.get('image_path')}")


if __name__ == "__main__":
    main()
