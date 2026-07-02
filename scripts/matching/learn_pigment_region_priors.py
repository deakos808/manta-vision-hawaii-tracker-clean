#!/usr/bin/env python3
"""Learn inspectable pigment-region priors from same-animal consistency rows.

This is deliberately not a black-box model. It bins already-extracted region
features and estimates which bins are repeatable across confirmed same-catalog
resight photos. The matcher can then boost stable-looking central pigment and
down-weight unstable artifact-like regions.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def main() -> None:
    parser = argparse.ArgumentParser(description="Learn deterministic pigment-region priors from region stability CSV.")
    parser.add_argument("--region-stability-csv", required=True)
    parser.add_argument("--out-json", default="scripts/matching/pigment_region_priors.json")
    parser.add_argument("--min-bin-count", type=int, default=6)
    args = parser.parse_args()

    rows = read_rows(args.region_stability_csv)
    if not rows:
        raise SystemExit("No region stability rows found.")

    bins: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        for key in region_keys(row):
            bins[key].append(row)

    priors: dict[str, Any] = {
        "prior_version": "same_catalog_region_stability_v1",
        "source_csv": str(args.region_stability_csv),
        "row_count": len(rows),
        "min_bin_count": int(args.min_bin_count),
        "default_multiplier": 1.0,
        "bins": {},
    }
    for key, members in sorted(bins.items()):
        stats = summarize_bin(members, args.min_bin_count)
        if stats:
            priors["bins"][key] = stats

    out = Path(args.out_json)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(priors, indent=2), encoding="utf-8")
    print(json.dumps({
        "out_json": str(out),
        "row_count": len(rows),
        "bin_count": len(priors["bins"]),
        "strong_boost_bins": sum(1 for b in priors["bins"].values() if b["multiplier"] > 1.10),
        "strong_penalty_bins": sum(1 for b in priors["bins"].values() if b["multiplier"] < 0.75),
    }, indent=2), flush=True)


def read_rows(path: str) -> list[dict[str, Any]]:
    with open(path, newline="", encoding="utf-8") as f:
        out = []
        for row in csv.DictReader(f):
            parsed = dict(row)
            for field in ("stability", "area_norm", "weight", "aspect", "eccentricity", "contrast", "centroid_x", "centroid_y"):
                parsed[field] = float(parsed.get(field) or 0.0)
            for field in ("near_side_or_pelvic_margin", "border_like"):
                parsed[field] = str(parsed.get(field)).lower() == "true"
            out.append(parsed)
        return out


def region_keys(row: dict[str, Any]) -> list[str]:
    zone = str(row.get("zone") or "unknown")
    margin = "margin" if row.get("near_side_or_pelvic_margin") else "interior"
    border = "border" if row.get("border_like") else "organic"
    aspect = aspect_bin(float(row.get("aspect") or 0.0))
    area = area_bin(float(row.get("area_norm") or 0.0))
    contrast = contrast_bin(float(row.get("contrast") or 0.0))
    return [
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}|area={area}|contrast={contrast}",
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}|area={area}",
        f"zone={zone}|margin={margin}|border={border}|aspect={aspect}",
        f"zone={zone}|margin={margin}|border={border}",
        f"zone={zone}|margin={margin}",
        f"zone={zone}",
    ]


def aspect_bin(value: float) -> str:
    if value < 1.6:
        return "compact"
    if value < 2.4:
        return "oval"
    if value < 3.6:
        return "elongated"
    return "linear"


def area_bin(value: float) -> str:
    if value < 0.0012:
        return "tiny"
    if value < 0.0035:
        return "small"
    if value < 0.010:
        return "medium"
    if value < 0.025:
        return "large"
    return "huge"


def contrast_bin(value: float) -> str:
    if value < 0.75:
        return "low"
    if value < 1.20:
        return "mid"
    return "high"


def summarize_bin(rows: list[dict[str, Any]], min_count: int) -> dict[str, Any] | None:
    count = len(rows)
    if count < min_count:
        return None
    stabilities = [float(row["stability"]) for row in rows]
    stable = sum(1 for value in stabilities if value >= 0.34)
    unstable = sum(1 for value in stabilities if value <= 0.10)
    stable_rate = stable / count
    unstable_rate = unstable / count
    mean_stability = sum(stabilities) / count

    # Smooth toward neutral so small bins do not dominate. Keep the range
    # conservative: enough to shift ranking, not enough to become a black box.
    evidence = (stable + 2.0) / (stable + unstable + 4.0)
    raw = 0.52 + 1.18 * evidence - 0.45 * unstable_rate + 0.35 * mean_stability
    multiplier = max(0.42, min(1.35, raw))
    return {
        "count": count,
        "mean_stability": mean_stability,
        "stable_rate": stable_rate,
        "unstable_rate": unstable_rate,
        "multiplier": multiplier,
    }


if __name__ == "__main__":
    main()
