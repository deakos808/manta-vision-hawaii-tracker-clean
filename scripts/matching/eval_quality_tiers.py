#!/usr/bin/env python3
"""Compare matcher performance across query photo quality tiers.

The intended quality ladder is:
  1. best catalog ventral photos
  2. best manta ventral photos
  3. all ventral photos

This script orchestrates the existing resumable evaluator for each available
query manifest and writes one combined summary table. Missing manifests are
reported and skipped so the all-ventral tier can be added later without
changing this runner.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


DEFAULT_TIERS = [
    {
        "name": "best_catalog_ventral",
        "label": "Best Catalog Ventral",
        "queries_csv": "export/best_catalog_photos/manifest.csv",
        "image_dir": "export/best_catalog_photos",
        "evaluator": "resight_rank",
        "include_self_photo": "true",
        "description": "Cleanest canonical catalog anchors. This is the upper-bound sanity tier.",
    },
    {
        "name": "best_manta_ventral",
        "label": "Best Manta Ventral",
        "queries_csv": "export/best_manta_ventral_photos_100/manifest.csv",
        "image_dir": "export/best_manta_ventral_photos_100",
        "evaluator": "resight_rank",
        "description": "Best per-sighting/resight ventral photos. This is the main admin-assisted matcher benchmark.",
    },
    {
        "name": "all_ventral",
        "label": "All Ventral",
        "queries_csv": "export/all_ventral_photos/manifest.csv",
        "image_dir": "export/all_ventral_photos",
        "evaluator": "resight_rank",
        "description": "Hardest real-world tier. Export this later to estimate citizen-submission robustness.",
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Run quality-tier matcher benchmarks.")
    parser.add_argument("--out-dir", default="scripts/matching/output/quality_tiers")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv", help="Best-catalog candidate manifest.")
    parser.add_argument("--image-dir", default="export/best_catalog_photos", help="Best-catalog candidate image directory.")
    parser.add_argument("--extra-anchors-csv", action="append", default=[], help="Optional multi-anchor CSV(s).")
    parser.add_argument("--query-limit", type=int, default=0, help="Optional first-N query limit per tier.")
    parser.add_argument("--sample-mode", choices=("first", "stratified"), default="first", help="Choose query rows in manifest order or round-robin across catalog IDs.")
    parser.add_argument("--stratified-per-catalog", type=int, default=1, help="Maximum query rows per catalog when --sample-mode stratified.")
    parser.add_argument("--limit", type=int, default=0, help="Optional first-N anchor limit for smoke tests.")
    parser.add_argument("--write-top-candidates", type=int, default=50)
    parser.add_argument("--resume", action="store_true", help="Resume each tier from its existing CSV.")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them.")
    parser.add_argument("--skip-best-catalog", action="store_true", help="Skip the best-catalog query tier.")
    parser.add_argument("--skip-best-manta", action="store_true", help="Skip the best-manta query tier.")
    parser.add_argument("--include-all-ventral", action="store_true", help="Include all-ventral tier if its manifest exists.")
    parser.add_argument("--anchor-log-every", type=int, default=300)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tiers = selected_tiers(args)
    summary_rows = []
    for tier in tiers:
        qpath = Path(tier["queries_csv"])
        if not qpath.exists():
            row = skipped_row(tier, f"missing_query_manifest:{qpath}")
            summary_rows.append(row)
            print(f"[tier {tier['name']}] SKIP {row['status']}", flush=True)
            continue

        tier_out = out_dir / tier["name"]
        cmd = build_eval_command(args, tier, tier_out)
        print(f"[tier {tier['name']}] {' '.join(cmd)}", flush=True)
        if not args.dry_run:
            subprocess.run(cmd, check=True)
        summary_rows.append(read_tier_summary(tier, tier_out, cmd, args.dry_run))

    write_combined_outputs(out_dir, summary_rows)
    print(json.dumps({"out_dir": str(out_dir), "tiers": summary_rows}, indent=2), flush=True)


def selected_tiers(args: argparse.Namespace) -> list[dict[str, str]]:
    out = []
    for tier in DEFAULT_TIERS:
        if tier["name"] == "best_catalog_ventral" and args.skip_best_catalog:
            continue
        if tier["name"] == "best_manta_ventral" and args.skip_best_manta:
            continue
        if tier["name"] == "all_ventral" and not args.include_all_ventral:
            continue
        out.append(tier)
    return out


def build_eval_command(args: argparse.Namespace, tier: dict[str, str], tier_out: Path) -> list[str]:
    cmd = [
        sys.executable,
        "-B",
        "scripts/matching/eval_resight_rank.py",
        "--queries-csv",
        tier["queries_csv"],
        "--manifest",
        args.manifest,
        "--image-dir",
        args.image_dir,
        "--out-dir",
        str(tier_out),
        "--write-top-candidates",
        str(args.write_top_candidates),
        "--anchor-log-every",
        str(args.anchor_log_every),
    ]
    for extra in args.extra_anchors_csv:
        cmd.extend(["--extra-anchors-csv", extra])
    if args.query_limit > 0:
        cmd.extend(["--query-limit", str(args.query_limit)])
    if args.sample_mode != "first":
        cmd.extend(["--sample-mode", args.sample_mode, "--stratified-per-catalog", str(args.stratified_per_catalog)])
    if args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])
    if args.resume:
        cmd.append("--resume")
    if tier.get("include_self_photo") == "true":
        cmd.append("--include-self-photo")
    return cmd


def read_tier_summary(tier: dict[str, str], tier_out: Path, cmd: list[str], dry_run: bool) -> dict[str, Any]:
    summary_path = tier_out / "resight_rank_summary.json"
    if dry_run:
        return {
            "tier": tier["name"],
            "label": tier["label"],
            "description": tier["description"],
            "status": "dry_run",
            "command": " ".join(cmd),
        }
    if not summary_path.exists():
        return skipped_row(tier, f"missing_summary:{summary_path}", command=" ".join(cmd))
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    return {
        "tier": tier["name"],
        "label": tier["label"],
        "description": tier["description"],
        "status": "complete",
        "evaluator": tier.get("evaluator", ""),
        "total": payload.get("total", 0),
        "rank1": payload.get("rank1", 0),
        "top10": payload.get("top10", 0),
        "top20": payload.get("top20", 0),
        "top50": payload.get("top50", payload.get("top20", 0)),
        "over50_or_missing": payload.get("over50_or_missing", payload.get("over20_or_missing", 0)),
        "top10_rate": payload.get("top10_rate", 0.0),
        "top20_rate": payload.get("top20_rate", 0.0),
        "top50_rate": payload.get("top50_rate", payload.get("top20_rate", 0.0)),
        "usable_total": payload.get("usable_total", 0),
        "usable_top10": payload.get("usable_top10", 0),
        "usable_top20": payload.get("usable_top20", 0),
        "usable_top50": payload.get("usable_top50", 0),
        "usable_top10_rate": payload.get("usable_top10_rate", 0.0),
        "usable_top20_rate": payload.get("usable_top20_rate", 0.0),
        "usable_top50_rate": payload.get("usable_top50_rate", 0.0),
        "expected_filtered_out": payload.get("expected_filtered_out", 0),
        "needs_review": payload.get("needs_review", 0),
        "csv": payload.get("csv", ""),
        "summary_json": str(summary_path),
        "command": " ".join(cmd),
    }


def skipped_row(tier: dict[str, str], status: str, command: str = "") -> dict[str, Any]:
    return {
        "tier": tier["name"],
        "label": tier["label"],
        "description": tier["description"],
        "status": status,
        "command": command,
    }


def write_combined_outputs(out_dir: Path, rows: list[dict[str, Any]]) -> None:
    json_path = out_dir / "quality_tier_summary.json"
    csv_path = out_dir / "quality_tier_summary.csv"
    json_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    fields = [
        "tier",
        "label",
        "status",
        "evaluator",
        "total",
        "rank1",
        "top10",
        "top20",
        "top50",
        "over50_or_missing",
        "top10_rate",
        "top20_rate",
        "top50_rate",
        "usable_total",
        "usable_top10",
        "usable_top20",
        "usable_top50",
        "usable_top10_rate",
        "usable_top20_rate",
        "usable_top50_rate",
        "expected_filtered_out",
        "needs_review",
        "csv",
        "summary_json",
        "description",
        "command",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
