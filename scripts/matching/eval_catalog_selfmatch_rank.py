#!/usr/bin/env python3
"""Rank every best catalog ventral photo against the best catalog set.

This is a pipeline sanity test. Identical best-catalog images should rank #1
when they are included in the candidate set. Poor self-rank means preprocessing,
feature extraction, scoring, or ranking is broken before real resight testing.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from pigment_region_matcher import DEFAULT_LONG_EDGE, build_catalog_from_manifest, load_or_create_signature, score_match


def main() -> None:
    parser = argparse.ArgumentParser(description="Best-catalog self-match rank evaluator")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv")
    parser.add_argument("--image-dir", default="export/best_catalog_photos")
    parser.add_argument("--out-dir", default="scripts/matching/output/catalog_selfmatch")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--limit", type=int, default=0, help="Optional first-N limit for smoke tests.")
    parser.add_argument("--query-limit", type=int, default=0, help="Optional first-N query limit, with all loaded anchors as candidates.")
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures", help="Reusable processed-photo signature cache.")
    parser.add_argument("--refresh-cache", action="store_true", help="Recompute signatures even if cache files already exist.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    anchors = build_catalog_from_manifest(args.manifest, args.image_dir)
    if args.limit > 0:
        anchors = anchors[: args.limit]
    if not anchors:
        raise SystemExit("No catalog anchors found.")

    print(f"Loading {len(anchors)} anchor signatures...", flush=True)
    processed: list[dict[str, Any]] = []
    for idx, anchor in enumerate(anchors, 1):
        try:
            proc, _, from_cache = load_or_create_signature(anchor, args.cache_dir, args.long_edge, args.refresh_cache)
            processed.append({**anchor, "processed": proc, "error": None})
            source = "cache" if from_cache else "processed"
            print(f"[prep {idx}/{len(anchors)}] {source} catalog={anchor['catalog_id']} photo={anchor['photo_id']} regions={len(proc.regions)}", flush=True)
        except Exception as exc:
            processed.append({**anchor, "processed": None, "error": str(exc)})
            print(f"[prep {idx}/{len(anchors)}] ERROR {anchor.get('image_path')}: {exc}", flush=True)

    queries = processed[: args.query_limit] if args.query_limit > 0 else processed
    rows: list[dict[str, Any]] = []

    for qidx, query in enumerate(queries, 1):
      qproc = query.get("processed")
      if qproc is None:
          rows.append(failure_row(query, "query_preprocess_failed"))
          continue

      candidates = []
      for candidate in processed:
          cproc = candidate.get("processed")
          if cproc is None:
              continue
          scored = score_match(qproc, cproc)
          candidates.append(
              {
                  **candidate,
                  "score": float(scored["score"]),
                  "match_count": scored["match_count"],
                  "pigment_iou": scored["pigment_iou"],
                  "median_reprojection_error": scored["median_reprojection_error_norm"],
                  "query_region_count": len(qproc.regions),
                  "candidate_region_count": len(cproc.regions),
              }
          )

      candidates.sort(key=lambda row: row["score"], reverse=True)
      expected_photo = str(query.get("photo_id") or "")
      expected_catalog = str(query.get("catalog_id") or "")
      true_rank = None
      true_candidate = None
      for rank, candidate in enumerate(candidates, 1):
          if str(candidate.get("photo_id") or "") == expected_photo:
              true_rank = rank
              true_candidate = candidate
              break

      top = candidates[0] if candidates else None
      true_score = float(true_candidate["score"]) if true_candidate else None
      top_score = float(top["score"]) if top else None
      row = {
          "run_id": "local_catalog_selfmatch",
          "evaluation_type": "best_catalog_selfmatch",
          "query_photo_id": int_or_blank(expected_photo),
          "query_catalog_id": int_or_blank(expected_catalog),
          "expected_catalog_id": int_or_blank(expected_catalog),
          "expected_photo_id": int_or_blank(expected_photo),
          "true_rank": true_rank,
          "true_score": true_score,
          "top_catalog_id": int_or_blank(top.get("catalog_id") if top else ""),
          "top_photo_id": int_or_blank(top.get("photo_id") if top else ""),
          "top_score": top_score,
          "score_gap": (top_score - true_score) if top_score is not None and true_score is not None else None,
          "query_region_count": len(qproc.regions),
          "top_match_region_count": top.get("candidate_region_count") if top else None,
          "body_mask_confidence": qproc.metrics.get("body_mask_confidence"),
          "pigment_iou": true_candidate.get("pigment_iou") if true_candidate else None,
          "median_reprojection_error": true_candidate.get("median_reprojection_error") if true_candidate else None,
          "debug_overlay_path": "",
          "diagnostic_flags": ",".join(diagnostic_flags(qproc, true_rank, true_candidate)),
          "reviewer_reason": "",
          "query_image_path": query.get("image_path", ""),
          "top_image_path": top.get("image_path", "") if top else "",
      }
      rows.append(row)
      top_score_text = f"{top_score:.2f}" if top_score is not None else "0.00"
      print(
          f"[rank {qidx}/{len(queries)}] catalog={expected_catalog} photo={expected_photo} true_rank={true_rank} top={row['top_catalog_id']} score={top_score_text}",
          flush=True,
      )

    write_outputs(out_dir, rows)


def failure_row(query: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "run_id": "local_catalog_selfmatch",
        "evaluation_type": "best_catalog_selfmatch",
        "query_photo_id": int_or_blank(query.get("photo_id")),
        "query_catalog_id": int_or_blank(query.get("catalog_id")),
        "expected_catalog_id": int_or_blank(query.get("catalog_id")),
        "expected_photo_id": int_or_blank(query.get("photo_id")),
        "true_rank": None,
        "true_score": None,
        "top_catalog_id": None,
        "top_photo_id": None,
        "top_score": None,
        "score_gap": None,
        "query_region_count": None,
        "top_match_region_count": None,
        "body_mask_confidence": None,
        "pigment_iou": None,
        "median_reprojection_error": None,
        "debug_overlay_path": "",
        "diagnostic_flags": reason,
        "reviewer_reason": "",
        "query_image_path": query.get("image_path", ""),
        "top_image_path": "",
    }


def diagnostic_flags(proc: Any, rank: int | None, true_candidate: dict[str, Any] | None) -> list[str]:
    flags: list[str] = []
    if rank is None:
        flags.append("missing_expected_match")
    elif rank > 20:
        flags.append("rank_gt_20")
    elif rank > 10:
        flags.append("rank_11_to_20")
    if len(proc.regions) < 5:
        flags.append("few_pigment_regions")
    if true_candidate and float(true_candidate.get("score") or 0.0) <= 0.0:
        flags.append("zero_true_score")
    if float(proc.metrics.get("body_mask_confidence", 0.0)) < 0.5:
        flags.append("low_body_mask_confidence")
    if true_candidate and float(true_candidate.get("pigment_iou") or 0.0) < 0.12:
        flags.append("low_pigment_iou")
    return flags


def write_outputs(out_dir: Path, rows: list[dict[str, Any]]) -> None:
    csv_path = out_dir / "catalog_selfmatch_results.csv"
    fields = [
        "run_id",
        "evaluation_type",
        "query_photo_id",
        "query_catalog_id",
        "expected_catalog_id",
        "expected_photo_id",
        "true_rank",
        "true_score",
        "top_catalog_id",
        "top_photo_id",
        "top_score",
        "score_gap",
        "query_region_count",
        "top_match_region_count",
        "body_mask_confidence",
        "pigment_iou",
        "median_reprojection_error",
        "debug_overlay_path",
        "diagnostic_flags",
        "reviewer_reason",
        "query_image_path",
        "top_image_path",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    summary = summarize(rows)
    summary["csv"] = str(csv_path)
    (out_dir / "catalog_selfmatch_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    rank1 = sum(1 for row in rows if row.get("true_rank") == 1)
    top10 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 10)
    top20 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 20)
    top50 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 50)
    over20 = sum(1 for row in rows if not isinstance(row.get("true_rank"), int) or row["true_rank"] > 20)
    over50 = sum(1 for row in rows if not isinstance(row.get("true_rank"), int) or row["true_rank"] > 50)
    needs_review = sum(1 for row in rows if row.get("diagnostic_flags"))
    return {
        "total": total,
        "rank1": rank1,
        "top10": top10,
        "top20": top20,
        "top50": top50,
        "over20_or_missing": over20,
        "over50_or_missing": over50,
        "needs_review": needs_review,
        "rank1_rate": rank1 / total if total else 0.0,
        "top10_rate": top10 / total if total else 0.0,
        "top20_rate": top20 / total if total else 0.0,
        "top50_rate": top50 / total if total else 0.0,
    }


def int_or_blank(value: Any) -> int | str:
    if value is None or value == "":
        return ""
    try:
        return int(value)
    except (TypeError, ValueError):
        return ""


if __name__ == "__main__":
    main()
