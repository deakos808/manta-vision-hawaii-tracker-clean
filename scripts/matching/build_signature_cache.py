#!/usr/bin/env python3
"""Build reusable deterministic matcher signatures for a manifest.

The signature is the inspectable, reusable photo descriptor used by the local
matcher: ROI, mask metrics, pigment-region descriptors, and compressed pigment
mask. It avoids re-running image segmentation on every evaluation.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from pigment_region_matcher import DEFAULT_LONG_EDGE, build_catalog_from_manifest, load_or_create_signature


def main() -> None:
    parser = argparse.ArgumentParser(description="Build cached manta matcher signatures.")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv")
    parser.add_argument("--image-dir", default="export/best_catalog_photos")
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument("--queries-csv", default="", help="Optional query CSV/manifest instead of catalog manifest.")
    args = parser.parse_args()

    if args.queries_csv:
        refs = read_query_refs(args.queries_csv)
    else:
        refs = build_catalog_from_manifest(args.manifest, args.image_dir)

    if args.limit > 0:
        refs = refs[: args.limit]
    if not refs:
        raise SystemExit("No image rows found.")

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    for idx, ref in enumerate(refs, 1):
        try:
            proc, signature, from_cache = load_or_create_signature(ref, cache_dir, args.long_edge, args.refresh_cache)
            rows.append(
                {
                    "photo_id": signature.get("photo_id", ""),
                    "catalog_id": signature.get("catalog_id", ""),
                    "image_path": signature.get("image_path", ""),
                    "region_count": len(proc.regions),
                    "body_mask_confidence": proc.metrics.get("body_mask_confidence"),
                    "body_mask_method": proc.metrics.get("body_mask_method"),
                    "from_cache": from_cache,
                    "status": "ok",
                }
            )
            source = "cache" if from_cache else "processed"
            print(
                f"[{idx}/{len(refs)}] {source} catalog={signature.get('catalog_id')} photo={signature.get('photo_id')} regions={len(proc.regions)}",
                flush=True,
            )
        except Exception as exc:
            rows.append(
                {
                    "photo_id": ref.get("photo_id", ""),
                    "catalog_id": ref.get("catalog_id", ""),
                    "image_path": ref.get("image_path", ""),
                    "region_count": "",
                    "body_mask_confidence": "",
                    "body_mask_method": "",
                    "from_cache": False,
                    "status": f"error:{exc}",
                }
            )
            print(f"[{idx}/{len(refs)}] ERROR {ref.get('image_path')}: {exc}", flush=True)

    summary = summarize(rows)
    (cache_dir / "cache_build_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with open(cache_dir / "cache_build_rows.csv", "w", newline="", encoding="utf-8") as f:
        fields = ["photo_id", "catalog_id", "image_path", "region_count", "body_mask_confidence", "body_mask_method", "from_cache", "status"]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(summary, indent=2), flush=True)


def read_query_refs(path: str | Path) -> list[dict[str, str]]:
    csv_path = Path(path)
    refs = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            catalog_id = row.get("catalog_id") or row.get("fk_catalog_id") or row.get("pk_catalog_id")
            photo_id = row.get("photo_id") or row.get("pk_photo_id")
            image_path = row.get("image_path") or row.get("path") or row.get("filename") or row.get("output_filename")
            if image_path and not Path(image_path).is_absolute():
                image_path = str(csv_path.parent / image_path)
            if catalog_id and photo_id and image_path:
                refs.append({"catalog_id": str(catalog_id), "photo_id": str(photo_id), "image_path": str(image_path), "label": Path(image_path).name})
    return refs


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [r for r in rows if r["status"] == "ok"]
    low_regions = [r for r in ok if isinstance(r.get("region_count"), int) and r["region_count"] < 5]
    return {
        "total": len(rows),
        "ok": len(ok),
        "errors": len(rows) - len(ok),
        "from_cache": sum(1 for r in ok if r.get("from_cache")),
        "processed": sum(1 for r in ok if not r.get("from_cache")),
        "low_region_count": len(low_regions),
        "cache_rows_csv": str(Path("cache_build_rows.csv")),
    }


if __name__ == "__main__":
    main()
