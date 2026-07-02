#!/usr/bin/env python3
"""Rank known resight/query photos against catalog anchor photos.

Input query CSV columns:
  catalog_id,photo_id,image_path

This is the first real accuracy harness after exact-image self-match. It asks:
"when this known resight is used as a query, where does its catalog rank among
the selected catalog anchors?"
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from pigment_region_matcher import (
    DEFAULT_LONG_EDGE,
    blended_final_score,
    build_catalog_from_manifest,
    load_or_create_signature,
    prefilter_scores,
    score_match,
    select_multipass_prefilter,
)

RESULT_FIELDS = [
    "query_catalog_id",
    "query_photo_id",
    "query_image_path",
    "true_rank",
    "natural_true_rank",
    "true_score",
    "top_catalog_id",
    "top_photo_id",
    "top_score",
    "true_final_score",
    "top_final_score",
    "score_gap",
    "coarse_rank",
    "coarse_top_catalog_id",
    "coarse_top_score",
    "exact_candidate_count",
    "natural_exact_candidate_count",
    "exact_catalog_count",
    "oracle_exact_candidate_count",
    "oracle_exact_catalog_count",
    "prefilter_top_n",
    "zone_prefilter_top_n",
    "relaxed_prefilter_top_n",
    "prefilter_mode",
    "prefilter_selected_count",
    "prefilter_selected_by_pass",
    "expected_in_prefilter",
    "forced_expected_count",
    "coarse_score_weight",
    "coarse_bonus_cap",
    "query_region_count",
    "query_signature_usable",
    "query_signature_zone_count",
    "query_signature_gill_central_weight_fraction",
    "query_signature_margin_weight_fraction",
    "query_signature_quality_flags",
    "top_candidates_json",
    "top_match_region_count",
    "body_mask_confidence",
    "pigment_iou",
    "median_reprojection_error",
    "constellation_score",
    "diagnostic_flags",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Known-resight catalog rank evaluator")
    parser.add_argument("--queries-csv", required=True, help="CSV with catalog_id,photo_id,image_path for known resight queries.")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv")
    parser.add_argument("--image-dir", default="export/best_catalog_photos")
    parser.add_argument("--extra-anchors-csv", action="append", default=[], help="Optional additional anchor CSV(s), e.g. best manta ventral photos.")
    parser.add_argument("--out-dir", default="scripts/matching/output/resight_rank")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--limit", type=int, default=0, help="Optional first-N anchor limit for smoke tests.")
    parser.add_argument("--query-offset", type=int, default=0, help="Skip the first N query rows before applying --query-limit.")
    parser.add_argument("--query-limit", type=int, default=0, help="Optional first-N query limit.")
    parser.add_argument("--sample-mode", choices=("first", "stratified"), default="first", help="Choose query rows in CSV order or round-robin across catalog IDs.")
    parser.add_argument("--stratified-per-catalog", type=int, default=1, help="Maximum query rows per catalog when --sample-mode stratified.")
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures", help="Reusable processed-photo signature cache.")
    parser.add_argument("--refresh-cache", action="store_true", help="Recompute signatures even if cache files already exist.")
    parser.add_argument("--prefilter-top-n", type=int, default=120, help="Run expensive geometry on top-N global coarse candidates. Use 0 for full scoring.")
    parser.add_argument("--zone-prefilter-top-n", type=int, default=80, help="Add top-N candidates from each anatomical zone retrieval pass.")
    parser.add_argument("--relaxed-prefilter-top-n", type=int, default=300, help="Add top-N candidates from the cheap relaxed region-geometry pass.")
    parser.add_argument("--coarse-score-weight", type=float, default=0.20, help="Capped coarse distribution tie-breaker weight in final catalog ranking.")
    parser.add_argument("--coarse-bonus-cap", type=float, default=8.0, help="Maximum final-score bonus contributed by coarse retrieval.")
    parser.add_argument("--write-top-candidates", type=int, default=25, help="Write per-query top-N catalog candidates as JSON for analysis. Use 0 to disable.")
    parser.add_argument("--anchor-log-every", type=int, default=50, help="Print one anchor cache/progress line every N anchors. Use 1 for verbose.")
    parser.add_argument("--resume", action="store_true", help="Append to existing output CSV/summary and skip already evaluated query photo IDs.")
    parser.add_argument("--flush-every", type=int, default=1, help="Write CSV/summary after every N newly evaluated queries.")
    parser.add_argument("--include-self-photo", action="store_true", help="Do not exclude identical query photo ID from candidates. Use for exact-image sanity tiers.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    anchors = build_catalog_from_manifest(args.manifest, args.image_dir)
    for extra_csv in args.extra_anchors_csv:
        anchors.extend(read_queries(extra_csv, role="anchor"))
    anchors = dedupe_anchors(anchors)
    if args.limit > 0:
        anchors = anchors[: args.limit]
    queries = read_queries(args.queries_csv)
    if args.query_offset > 0:
        queries = queries[args.query_offset :]
    queries = select_query_sample(
        queries,
        mode=args.sample_mode,
        limit=args.query_limit,
        per_catalog=args.stratified_per_catalog,
    )
    rows = load_existing_results(out_dir) if args.resume else []
    completed_photo_ids = {str(row.get("query_photo_id")) for row in rows if str(row.get("query_photo_id") or "")}
    if completed_photo_ids:
        before = len(queries)
        queries = [row for row in queries if str(row.get("photo_id") or "") not in completed_photo_ids]
        print(f"Resume enabled: loaded {len(rows)} existing rows and skipped {before - len(queries)} query rows.", flush=True)
    if not anchors:
        raise SystemExit("No catalog anchors found.")
    if not queries and not rows:
        raise SystemExit("No query rows found.")
    if not queries:
        write_outputs(out_dir, rows)
        return

    print(f"Loading {len(anchors)} catalog anchor signatures...", flush=True)
    processed_anchors: list[dict[str, Any]] = []
    for idx, anchor in enumerate(anchors, 1):
        try:
            proc, _, from_cache = load_or_create_signature(anchor, args.cache_dir, args.long_edge, args.refresh_cache)
            processed_anchors.append({**anchor, "processed": proc, "error": None})
            source = "cache" if from_cache else "processed"
            if args.anchor_log_every <= 1 or idx == 1 or idx == len(anchors) or idx % args.anchor_log_every == 0:
                print(f"[anchor {idx}/{len(anchors)}] {source} catalog={anchor['catalog_id']} photo={anchor['photo_id']} regions={len(proc.regions)}", flush=True)
        except Exception as exc:
            processed_anchors.append({**anchor, "processed": None, "error": str(exc)})
            print(f"[anchor {idx}/{len(anchors)}] ERROR {anchor.get('image_path')}: {exc}", flush=True)

    new_rows = 0
    for qidx, query in enumerate(queries, 1):
        qpath = Path(str(query["image_path"]))
        if not qpath.exists():
            rows.append(failure_row(query, "query_image_missing"))
            new_rows += 1
            maybe_flush(out_dir, rows, new_rows, args.flush_every)
            print(f"[query {qidx}/{len(queries)}] MISSING {qpath}", flush=True)
            continue
        try:
            qproc, _, q_from_cache = load_or_create_signature(query, args.cache_dir, args.long_edge, args.refresh_cache)
            q_source = "cache" if q_from_cache else "processed"
        except Exception as exc:
            rows.append(failure_row(query, f"query_preprocess_failed:{exc}"))
            new_rows += 1
            maybe_flush(out_dir, rows, new_rows, args.flush_every)
            print(f"[query {qidx}/{len(queries)}] ERROR {qpath}: {exc}", flush=True)
            continue

        query_photo_id = str(query.get("photo_id") or "")
        coarse_candidates = []
        for anchor in processed_anchors:
            aproc = anchor.get("processed")
            if aproc is None:
                continue
            if not args.include_self_photo and str(anchor.get("photo_id") or "") == query_photo_id:
                continue
            coarse_candidates.append({**anchor, **prefilter_scores(qproc, aproc)})

        coarse_candidates.sort(key=lambda row: row["coarse_score"], reverse=True)
        expected_catalog = str(query["catalog_id"])
        coarse_catalogs = aggregate_by_catalog(coarse_candidates, "coarse_score")
        coarse_rank = None
        for rank, candidate in enumerate(coarse_catalogs, 1):
            if str(candidate.get("catalog_id")) == expected_catalog:
                coarse_rank = rank
                break

        selected, prefilter_info = select_multipass_prefilter(
            coarse_candidates,
            global_top_n=args.prefilter_top_n,
            zone_top_n=args.zone_prefilter_top_n,
            relaxed_top_n=args.relaxed_prefilter_top_n,
        )
        natural_selected_ids = {str(row.get("photo_id")) for row in selected}
        expected_in_prefilter = any(str(row.get("catalog_id")) == expected_catalog for row in selected)

        forced_expected_count = 0
        selected_ids = set(natural_selected_ids)
        for candidate in coarse_candidates:
            if str(candidate.get("catalog_id")) == expected_catalog and str(candidate.get("photo_id")) not in selected_ids:
                selected.append(candidate)
                selected_ids.add(str(candidate.get("photo_id")))
                forced_expected_count += 1

        candidates = []
        for anchor in selected:
            aproc = anchor.get("processed")
            if aproc is None:
                continue
            scored = score_match(qproc, aproc)
            exact_score = float(scored["score"])
            coarse_score = float(anchor.get("coarse_score", 0.0))
            final_score = blended_final_score(exact_score, coarse_score, args.coarse_score_weight, args.coarse_bonus_cap)
            candidates.append(
                {
                    **anchor,
                    "score": exact_score,
                    "coarse_score": coarse_score,
                    "final_score": final_score,
                    "retrieval_score": float(anchor.get("retrieval_score", coarse_score)),
                    "best_zone_score": float(anchor.get("best_zone_score", 0.0)),
                    "relaxed_geometry_score": float(anchor.get("relaxed_geometry_score", 0.0)),
                    "gill_chest_score": float(anchor.get("gill_chest_score", 0.0)),
                    "central_belly_score": float(anchor.get("central_belly_score", 0.0)),
                    "pelvic_belly_score": float(anchor.get("pelvic_belly_score", 0.0)),
                    "match_count": scored["match_count"],
                    "pigment_iou": scored["pigment_iou"],
                    "median_reprojection_error": scored["median_reprojection_error_norm"],
                    "query_region_count": len(qproc.regions),
                    "candidate_region_count": len(aproc.regions),
                    "diagnostic_score_components": {
                        "normalized_weighted_regions": scored["normalized_weighted_regions"],
                        "spatial_spread": scored["spatial_spread"],
                        "zone_count": scored["zone_count"],
                        "zone_consistency": scored["zone_consistency"],
                        "tri_zone_present_count": scored["tri_zone_present_count"],
                        "tri_zone_matched_count": scored["tri_zone_matched_count"],
                        "tri_zone_coverage": scored["tri_zone_coverage"],
                        "tri_zone_bonus": scored["tri_zone_bonus"],
                        "constellation_score": scored["constellation_score"],
                        "constellation_bonus": scored["constellation_bonus"],
                        "rotation_degrees": scored["transform_rotation_degrees"],
                        "scale": scored["transform_scale"],
                        "anatomy_penalty": scored["anatomy_penalty"],
                    },
                }
            )

        candidates.sort(key=lambda row: row["final_score"], reverse=True)
        catalog_candidates = aggregate_by_catalog(candidates, "final_score")
        natural_catalog_candidates = aggregate_by_catalog(
            [row for row in candidates if str(row.get("photo_id")) in natural_selected_ids],
            "final_score",
        )
        true_rank = None
        true_candidate = None
        for rank, candidate in enumerate(catalog_candidates, 1):
            if str(candidate.get("catalog_id")) == expected_catalog:
                true_rank = rank
                true_candidate = candidate
                break
        natural_true_rank = None
        natural_true_candidate = None
        for rank, candidate in enumerate(natural_catalog_candidates, 1):
            if str(candidate.get("catalog_id")) == expected_catalog:
                natural_true_rank = rank
                natural_true_candidate = candidate
                break

        top = catalog_candidates[0] if catalog_candidates else None
        natural_top = natural_catalog_candidates[0] if natural_catalog_candidates else None
        top_candidates_path = ""
        if args.write_top_candidates > 0:
            top_candidates_path = write_top_candidates(
                out_dir,
                query,
                natural_catalog_candidates[: args.write_top_candidates],
                args.write_top_candidates,
            )
        true_score = float(true_candidate["score"]) if true_candidate else None
        true_final_score = float(true_candidate["final_score"]) if true_candidate else None
        display_top = natural_top or top
        top_score = float(display_top["score"]) if display_top else None
        top_final_score = float(display_top["final_score"]) if display_top else None
        row = {
            "query_catalog_id": int_or_blank(query.get("catalog_id")),
            "query_photo_id": int_or_blank(query.get("photo_id")),
            "query_image_path": str(qpath),
            "true_rank": true_rank,
            "natural_true_rank": natural_true_rank,
            "true_score": true_score,
            "top_catalog_id": int_or_blank(display_top.get("catalog_id") if display_top else ""),
            "top_photo_id": int_or_blank(display_top.get("photo_id") if display_top else ""),
            "top_score": top_score,
            "true_final_score": true_final_score,
            "top_final_score": top_final_score,
            "score_gap": (top_score - true_score) if top_score is not None and true_score is not None else None,
            "coarse_rank": coarse_rank,
            "coarse_top_catalog_id": int_or_blank(coarse_catalogs[0].get("catalog_id") if coarse_catalogs else ""),
            "coarse_top_score": float(coarse_catalogs[0].get("coarse_score", 0.0)) if coarse_catalogs else None,
            "exact_candidate_count": len(candidates),
            "natural_exact_candidate_count": len(natural_selected_ids),
            "exact_catalog_count": len(natural_catalog_candidates),
            "oracle_exact_candidate_count": len(candidates),
            "oracle_exact_catalog_count": len(catalog_candidates),
            "prefilter_top_n": args.prefilter_top_n,
            "zone_prefilter_top_n": args.zone_prefilter_top_n,
            "relaxed_prefilter_top_n": args.relaxed_prefilter_top_n,
            "prefilter_mode": prefilter_info.get("prefilter_mode"),
            "prefilter_selected_count": prefilter_info.get("selected_count"),
            "prefilter_selected_by_pass": json.dumps(prefilter_info.get("selected_by_pass", {}), sort_keys=True),
            "expected_in_prefilter": expected_in_prefilter,
            "forced_expected_count": forced_expected_count,
            "coarse_score_weight": args.coarse_score_weight,
            "coarse_bonus_cap": args.coarse_bonus_cap,
            "query_region_count": len(qproc.regions),
            "query_signature_usable": bool(qproc.metrics.get("signature_usable", False)),
            "query_signature_zone_count": qproc.metrics.get("signature_zone_count"),
            "query_signature_gill_central_weight_fraction": qproc.metrics.get("signature_gill_central_weight_fraction"),
            "query_signature_margin_weight_fraction": qproc.metrics.get("signature_margin_weight_fraction"),
            "query_signature_quality_flags": ";".join(qproc.metrics.get("signature_quality_flags") or []),
            "top_candidates_json": top_candidates_path,
            "top_match_region_count": display_top.get("candidate_region_count") if display_top else None,
            "body_mask_confidence": qproc.metrics.get("body_mask_confidence"),
            "pigment_iou": true_candidate.get("pigment_iou") if true_candidate else None,
            "median_reprojection_error": true_candidate.get("median_reprojection_error") if true_candidate else None,
            "constellation_score": true_candidate.get("diagnostic_score_components", {}).get("constellation_score") if true_candidate else None,
            "diagnostic_flags": ",".join(diagnostic_flags(qproc, natural_true_rank, natural_true_candidate, expected_in_prefilter)),
        }
        rows.append(row)
        new_rows += 1
        print(
            f"[query {qidx}/{len(queries)}] {q_source} catalog={expected_catalog} photo={query.get('photo_id')} coarse_rank={coarse_rank} natural_rank={natural_true_rank} oracle_rank={true_rank} in_prefilter={expected_in_prefilter} top={row['top_catalog_id']}",
            flush=True,
        )
        maybe_flush(out_dir, rows, new_rows, args.flush_every)

    write_outputs(out_dir, rows)


def read_queries(path: str | Path, role: str = "query") -> list[dict[str, str]]:
    csv_path = Path(path)
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = []
        for row in csv.DictReader(f):
            catalog_id = row.get("catalog_id") or row.get("fk_catalog_id") or row.get("pk_catalog_id")
            photo_id = row.get("photo_id") or row.get("pk_photo_id")
            image_path = row.get("image_path") or row.get("path") or row.get("filename") or row.get("output_filename")
            if image_path and not Path(image_path).is_absolute():
                image_path = str(csv_path.parent / image_path)
            if catalog_id and photo_id and image_path:
                label = row.get("output_filename") or Path(image_path).name
                rows.append({"catalog_id": str(catalog_id), "photo_id": str(photo_id), "image_path": str(image_path), "label": str(label), "anchor_role": role})
        return rows


def select_query_sample(
    rows: list[dict[str, str]],
    mode: str = "first",
    limit: int = 0,
    per_catalog: int = 1,
) -> list[dict[str, str]]:
    if mode == "first":
        return rows[:limit] if limit > 0 else rows
    if mode != "stratified":
        raise ValueError(f"Unknown sample mode: {mode}")

    by_catalog: dict[str, list[dict[str, str]]] = {}
    catalog_order: list[str] = []
    for row in rows:
        catalog_id = str(row.get("catalog_id") or "")
        if catalog_id not in by_catalog:
            by_catalog[catalog_id] = []
            catalog_order.append(catalog_id)
        if per_catalog <= 0 or len(by_catalog[catalog_id]) < per_catalog:
            by_catalog[catalog_id].append(row)

    selected: list[dict[str, str]] = []
    depth = 0
    while True:
        added = False
        for catalog_id in catalog_order:
            bucket = by_catalog.get(catalog_id, [])
            if depth >= len(bucket):
                continue
            selected.append(bucket[depth])
            added = True
            if limit > 0 and len(selected) >= limit:
                return selected
        if not added:
            break
        depth += 1
    return selected


def dedupe_anchors(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for row in rows:
        key = str(row.get("photo_id") or row.get("image_path") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def aggregate_by_catalog(rows: list[dict[str, Any]], score_field: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        catalog_id = str(row.get("catalog_id") or "")
        if not catalog_id:
            continue
        grouped.setdefault(catalog_id, []).append(row)

    aggregated: list[dict[str, Any]] = []
    for catalog_id, catalog_rows in grouped.items():
        ranked = sorted(catalog_rows, key=lambda row: float(row.get(score_field) or 0.0), reverse=True)
        best = dict(ranked[0])
        best_score = float(best.get(score_field) or 0.0)
        support_scores = [float(row.get(score_field) or 0.0) for row in ranked[1:4] if float(row.get(score_field) or 0.0) >= max(6.0, best_score * 0.34)]
        support_bonus = min(10.0, sum(min(3.5, score * 0.06) for score in support_scores))
        if len(support_scores) >= 2:
            support_bonus += 1.5
        aggregated_score = best_score + support_bonus
        best[f"{score_field}_best_anchor_score"] = best_score
        best[f"{score_field}_catalog_support_bonus"] = float(support_bonus)
        best[f"{score_field}_catalog_support_count"] = len(support_scores) + 1
        best[f"{score_field}_catalog_aggregated_score"] = float(aggregated_score)
        aggregated.append(best)
    return sorted(aggregated, key=lambda row: float(row.get(f"{score_field}_catalog_aggregated_score") or row.get(score_field) or 0.0), reverse=True)


def failure_row(query: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "query_catalog_id": int_or_blank(query.get("catalog_id")),
        "query_photo_id": int_or_blank(query.get("photo_id")),
        "query_image_path": query.get("image_path", ""),
        "true_rank": None,
        "true_score": None,
        "top_catalog_id": None,
        "top_photo_id": None,
        "top_score": None,
        "score_gap": None,
        "query_region_count": None,
        "query_signature_usable": None,
        "query_signature_zone_count": None,
        "query_signature_gill_central_weight_fraction": None,
        "query_signature_margin_weight_fraction": None,
        "query_signature_quality_flags": "",
        "top_candidates_json": "",
        "top_match_region_count": None,
        "body_mask_confidence": None,
        "pigment_iou": None,
        "median_reprojection_error": None,
        "constellation_score": None,
        "diagnostic_flags": reason,
    }


def diagnostic_flags(proc: Any, rank: int | None, true_candidate: dict[str, Any] | None, expected_in_prefilter: bool = True) -> list[str]:
    flags: list[str] = []
    if not expected_in_prefilter:
        flags.append("expected_catalog_filtered_out")
    if rank is None:
        flags.append("missing_expected_catalog")
    elif rank > 20:
        flags.append("rank_gt_20")
    elif rank > 10:
        flags.append("rank_11_to_20")
    if len(proc.regions) < 5:
        flags.append("few_pigment_regions")
    for flag in proc.metrics.get("signature_quality_flags") or []:
        if flag not in flags:
            flags.append(str(flag))
    if true_candidate and float(true_candidate.get("score") or 0.0) <= 0.0:
        flags.append("zero_true_score")
    if float(proc.metrics.get("body_mask_confidence", 0.0)) < 0.5:
        flags.append("low_body_mask_confidence")
    if true_candidate and float(true_candidate.get("pigment_iou") or 0.0) < 0.08:
        flags.append("low_pigment_iou")
    return flags


def maybe_flush(out_dir: Path, rows: list[dict[str, Any]], new_rows: int, flush_every: int) -> None:
    if flush_every <= 0:
        return
    if new_rows % flush_every == 0:
        write_outputs(out_dir, rows, announce=False)


def load_existing_results(out_dir: Path) -> list[dict[str, Any]]:
    csv_path = out_dir / "resight_rank_results.csv"
    if not csv_path.exists():
        return []
    with open(csv_path, newline="", encoding="utf-8") as f:
        return [coerce_existing_row(row) for row in csv.DictReader(f)]


def coerce_existing_row(row: dict[str, str]) -> dict[str, Any]:
    int_fields = {
        "query_catalog_id",
        "query_photo_id",
        "true_rank",
        "natural_true_rank",
        "top_catalog_id",
        "top_photo_id",
        "coarse_rank",
        "coarse_top_catalog_id",
        "exact_candidate_count",
        "natural_exact_candidate_count",
        "exact_catalog_count",
        "oracle_exact_candidate_count",
        "oracle_exact_catalog_count",
        "prefilter_top_n",
        "zone_prefilter_top_n",
        "relaxed_prefilter_top_n",
        "prefilter_selected_count",
        "forced_expected_count",
        "query_region_count",
        "query_signature_zone_count",
        "top_match_region_count",
    }
    float_fields = {
        "true_score",
        "top_score",
        "true_final_score",
        "top_final_score",
        "score_gap",
        "coarse_top_score",
        "coarse_score_weight",
        "coarse_bonus_cap",
        "query_signature_gill_central_weight_fraction",
        "query_signature_margin_weight_fraction",
        "body_mask_confidence",
        "pigment_iou",
        "median_reprojection_error",
        "constellation_score",
    }
    bool_fields = {"expected_in_prefilter", "query_signature_usable"}
    out: dict[str, Any] = dict(row)
    for field in int_fields:
        out[field] = int_or_none(row.get(field))
    for field in float_fields:
        out[field] = float_or_none(row.get(field))
    for field in bool_fields:
        out[field] = bool_or_none(row.get(field))
    return out


def int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def bool_or_none(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return None
    text = str(value).strip().lower()
    if text in {"true", "1", "yes"}:
        return True
    if text in {"false", "0", "no"}:
        return False
    return None


def write_outputs(out_dir: Path, rows: list[dict[str, Any]], announce: bool = True) -> None:
    csv_path = out_dir / "resight_rank_results.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RESULT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    summary = summarize(rows)
    summary["csv"] = str(csv_path)
    (out_dir / "resight_rank_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    if announce:
        print(json.dumps(summary, indent=2), flush=True)


def write_top_candidates(out_dir: Path, query: dict[str, Any], rows: list[dict[str, Any]], limit: int) -> str:
    detail_dir = out_dir / "top_candidates"
    detail_dir.mkdir(parents=True, exist_ok=True)
    qid = str(query.get("photo_id") or "unknown")
    path = detail_dir / f"query_{qid}_top{limit}.json"
    payload = []
    for rank, row in enumerate(rows, 1):
        payload.append(
            {
                "rank": rank,
                "catalog_id": row.get("catalog_id"),
                "photo_id": row.get("photo_id"),
                "label": row.get("label"),
                "image_path": row.get("image_path"),
                "score": row.get("score"),
                "coarse_score": row.get("coarse_score"),
                "retrieval_score": row.get("retrieval_score"),
                "best_zone_score": row.get("best_zone_score"),
                "relaxed_geometry_score": row.get("relaxed_geometry_score"),
                "final_score": row.get("final_score"),
                "match_count": row.get("match_count"),
                "pigment_iou": row.get("pigment_iou"),
                "median_reprojection_error": row.get("median_reprojection_error"),
                "constellation_score": row.get("diagnostic_score_components", {}).get("constellation_score"),
                "query_region_count": row.get("query_region_count"),
                "candidate_region_count": row.get("candidate_region_count"),
                "diagnostic_score_components": row.get("diagnostic_score_components"),
            }
        )
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(path)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    rank_key = "natural_true_rank"
    rank1 = sum(1 for row in rows if row.get(rank_key) == 1)
    top10 = sum(1 for row in rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 10)
    top20 = sum(1 for row in rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 20)
    top50 = sum(1 for row in rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 50)
    over20 = sum(1 for row in rows if not isinstance(row.get(rank_key), int) or row[rank_key] > 20)
    over50 = sum(1 for row in rows if not isinstance(row.get(rank_key), int) or row[rank_key] > 50)
    needs_review = sum(1 for row in rows if row.get("diagnostic_flags"))
    usable_rows = [row for row in rows if row.get("query_signature_usable") is True]
    usable_total = len(usable_rows)
    usable_rank1 = sum(1 for row in usable_rows if row.get(rank_key) == 1)
    usable_top10 = sum(1 for row in usable_rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 10)
    usable_top20 = sum(1 for row in usable_rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 20)
    usable_top50 = sum(1 for row in usable_rows if isinstance(row.get(rank_key), int) and row[rank_key] <= 50)
    expected_filtered_out = sum(1 for row in rows if row.get("expected_in_prefilter") is False or row.get("expected_in_prefilter") == "False")
    oracle_top10 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 10)
    oracle_top20 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 20)
    oracle_top50 = sum(1 for row in rows if isinstance(row.get("true_rank"), int) and row["true_rank"] <= 50)
    return {
        "total": total,
        "rank_basis": rank_key,
        "rank1": rank1,
        "top10": top10,
        "top20": top20,
        "top50": top50,
        "over20_or_missing": over20,
        "over50_or_missing": over50,
        "needs_review": needs_review,
        "expected_filtered_out": expected_filtered_out,
        "oracle_top10": oracle_top10,
        "oracle_top20": oracle_top20,
        "oracle_top50": oracle_top50,
        "rank1_rate": rank1 / total if total else 0.0,
        "top10_rate": top10 / total if total else 0.0,
        "top20_rate": top20 / total if total else 0.0,
        "top50_rate": top50 / total if total else 0.0,
        "usable_total": usable_total,
        "usable_rank1": usable_rank1,
        "usable_top10": usable_top10,
        "usable_top20": usable_top20,
        "usable_top50": usable_top50,
        "usable_rank1_rate": usable_rank1 / usable_total if usable_total else 0.0,
        "usable_top10_rate": usable_top10 / usable_total if usable_total else 0.0,
        "usable_top20_rate": usable_top20 / usable_total if usable_total else 0.0,
        "usable_top50_rate": usable_top50 / usable_total if usable_total else 0.0,
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
