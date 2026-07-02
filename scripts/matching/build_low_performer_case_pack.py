#!/usr/bin/env python3
"""Build an inspectable case pack for a low-performing matcher query.

This tool is for improving the matcher, not for changing production ranking.
It takes one known query, reproduces the catalog ranking path, identifies the
expected catalog candidate and the top wrong candidate, then writes fresh debug
images for normal and enhanced pigment processing.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from eval_resight_rank import aggregate_by_catalog, dedupe_anchors, read_queries
from pigment_region_matcher import (
    DEFAULT_LONG_EDGE,
    blended_final_score,
    build_catalog_from_manifest,
    draw_pair_overlay,
    ensure_dir,
    load_or_create_signature,
    prefilter_scores,
    process_image,
    save_debug,
    score_match,
    select_multipass_prefilter,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a low-performer visual/JSON case pack.")
    parser.add_argument("--queries-csv", required=True, help="CSV containing known query photos.")
    parser.add_argument("--query-photo-id", help="Specific query photo ID to inspect.")
    parser.add_argument("--query-offset", type=int, default=0, help="Fallback: inspect the Nth query row after CSV load.")
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv")
    parser.add_argument("--image-dir", default="export/best_catalog_photos")
    parser.add_argument("--extra-anchors-csv", action="append", default=[], help="Optional additional anchor CSV(s).")
    parser.add_argument("--out-dir", default="scripts/matching/output/case_packs")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures")
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Optional first-N anchor limit for smoke tests.")
    parser.add_argument("--prefilter-top-n", type=int, default=120)
    parser.add_argument("--zone-prefilter-top-n", type=int, default=80)
    parser.add_argument("--relaxed-prefilter-top-n", type=int, default=300)
    parser.add_argument("--coarse-score-weight", type=float, default=0.20)
    parser.add_argument("--coarse-bonus-cap", type=float, default=8.0)
    parser.add_argument("--top-n", type=int, default=25)
    parser.add_argument("--expected-photo-id", help="Targeted mode: known correct candidate photo ID.")
    parser.add_argument("--expected-catalog-id", help="Targeted mode: choose the best available anchor from this correct catalog ID.")
    parser.add_argument("--top-wrong-photo-id", help="Targeted mode: known wrong top candidate photo ID.")
    parser.add_argument("--skip-ranking", action="store_true", help="Only build targeted pair debug packs; do not rank the full catalog.")
    args = parser.parse_args()

    queries = read_queries(args.queries_csv)
    query = select_query(queries, args.query_photo_id, args.query_offset)
    anchors = build_catalog_from_manifest(args.manifest, args.image_dir)
    for extra_csv in args.extra_anchors_csv:
        anchors.extend(read_queries(extra_csv, role="anchor"))
    anchors = dedupe_anchors(anchors)
    if args.limit > 0:
        anchors = anchors[: args.limit]

    if not anchors:
        raise SystemExit("No anchors found.")

    out_root = Path(args.out_dir) / f"query_{query['photo_id']}_catalog_{query['catalog_id']}"
    ensure_dir(out_root)

    ranking: dict[str, Any] | None = None
    if args.skip_ranking:
        if not (args.expected_photo_id or args.expected_catalog_id) or not args.top_wrong_photo_id:
            raise SystemExit("--skip-ranking requires --expected-photo-id or --expected-catalog-id, plus --top-wrong-photo-id.")
        expected = anchor_by_photo_id(anchors, args.expected_photo_id) if args.expected_photo_id else None
        if expected is None and args.expected_catalog_id:
            expected = best_anchor_for_catalog(query, anchors, args.expected_catalog_id, args)
        top_wrong = anchor_by_photo_id(anchors, args.top_wrong_photo_id)
        if expected is None:
            target = args.expected_photo_id or f"catalog_id {args.expected_catalog_id}"
            raise SystemExit(f"Expected candidate {target} not found in anchors.")
        if top_wrong is None:
            raise SystemExit(f"Top-wrong photo_id {args.top_wrong_photo_id} not found in anchors.")
    else:
        ranking = rank_query(query, anchors, args)
        write_ranking_outputs(out_root, ranking, args.top_n)
        expected = ranking["true_candidate"]
        top_wrong = first_wrong_candidate(ranking["catalog_candidates"], str(query["catalog_id"]))

    if expected is None:
        raise SystemExit(f"Expected catalog {query['catalog_id']} was not available for case-pack comparison.")
    if top_wrong is None:
        raise SystemExit("No wrong top candidate found; query appears to rank expected catalog first.")

    pair_cases = []
    for variant, enhance in (("normal", False), ("enhanced", True)):
        pair_cases.append(
            build_pair_case(
                out_root=out_root,
                label=f"{variant}_expected",
                query=query,
                candidate=expected,
                enhance=enhance,
                long_edge=args.long_edge,
            )
        )
        pair_cases.append(
            build_pair_case(
                out_root=out_root,
                label=f"{variant}_top_wrong",
                query=query,
                candidate=top_wrong,
                enhance=enhance,
                long_edge=args.long_edge,
            )
        )

    summary = {
        "query": public_ref(query),
        "ranking": ranking_summary(ranking, expected, top_wrong),
        "interpretation": interpret_case_pack(ranking, pair_cases),
        "pair_cases": pair_cases,
        "top_candidates_json": str(out_root / "top_candidates.json") if ranking else "",
        "top_candidates_csv": str(out_root / "top_candidates.csv") if ranking else "",
    }
    (out_root / "case_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary["ranking"], indent=2), flush=True)
    print(f"Case pack written to {out_root}", flush=True)


def select_query(rows: list[dict[str, str]], photo_id: str | None, offset: int) -> dict[str, str]:
    if photo_id:
        for row in rows:
            if str(row.get("photo_id")) == str(photo_id):
                return row
        raise SystemExit(f"Query photo_id {photo_id} not found.")
    if offset < 0 or offset >= len(rows):
        raise SystemExit(f"--query-offset {offset} outside query row count {len(rows)}.")
    return rows[offset]


def anchor_by_photo_id(rows: list[dict[str, str]], photo_id: str) -> dict[str, str] | None:
    for row in rows:
        if str(row.get("photo_id")) == str(photo_id):
            return row
    return None


def best_anchor_for_catalog(
    query: dict[str, str],
    anchors: list[dict[str, str]],
    catalog_id: str,
    args: argparse.Namespace,
) -> dict[str, Any] | None:
    """Pick the strongest same-catalog anchor for a targeted visual case pack."""
    qproc, _, _ = load_or_create_signature(query, args.cache_dir, args.long_edge, args.refresh_cache)
    query_photo_id = str(query.get("photo_id") or "")
    best: dict[str, Any] | None = None
    same_catalog = [
        row
        for row in anchors
        if str(row.get("catalog_id") or "") == str(catalog_id)
        and str(row.get("photo_id") or "") != query_photo_id
    ]
    if not same_catalog:
        return None
    print(
        f"Selecting best expected anchor from {len(same_catalog)} anchors for catalog {catalog_id}...",
        flush=True,
    )
    for anchor in same_catalog:
        try:
            aproc, _, _ = load_or_create_signature(anchor, args.cache_dir, args.long_edge, args.refresh_cache)
            scored = score_match(qproc, aproc)
            coarse = prefilter_scores(qproc, aproc)
            exact_score = float(scored["score"])
            final_score = blended_final_score(
                exact_score,
                float(coarse.get("coarse_score", 0.0)),
                args.coarse_score_weight,
                args.coarse_bonus_cap,
            )
            candidate = {
                **anchor,
                "score": exact_score,
                "coarse_score": float(coarse.get("coarse_score", 0.0)),
                "final_score": final_score,
                "match_count": scored["match_count"],
                "pigment_iou": scored["pigment_iou"],
                "median_reprojection_error": scored["median_reprojection_error_norm"],
                "constellation_score": scored["constellation_score"],
            }
            if best is None or float(candidate["final_score"]) > float(best.get("final_score") or 0.0):
                best = candidate
        except Exception as exc:
            print(f"Expected-anchor candidate failed catalog={catalog_id} photo={anchor.get('photo_id')}: {exc}", flush=True)
    if best:
        print(
            f"Selected expected anchor catalog={best.get('catalog_id')} photo={best.get('photo_id')} final_score={float(best.get('final_score') or 0.0):.4f}",
            flush=True,
        )
    return best


def rank_query(query: dict[str, str], anchors: list[dict[str, str]], args: argparse.Namespace) -> dict[str, Any]:
    qproc, _, q_from_cache = load_or_create_signature(query, args.cache_dir, args.long_edge, args.refresh_cache)
    processed_anchors = []
    for idx, anchor in enumerate(anchors, 1):
        try:
            aproc, _, from_cache = load_or_create_signature(anchor, args.cache_dir, args.long_edge, args.refresh_cache)
            processed_anchors.append({**anchor, "processed": aproc, "error": None})
            if idx == 1 or idx == len(anchors) or idx % 100 == 0:
                source = "cache" if from_cache else "processed"
                print(f"[anchor {idx}/{len(anchors)}] {source} catalog={anchor.get('catalog_id')} photo={anchor.get('photo_id')} regions={len(aproc.regions)}", flush=True)
        except Exception as exc:
            processed_anchors.append({**anchor, "processed": None, "error": str(exc)})
            print(f"[anchor {idx}/{len(anchors)}] ERROR {anchor.get('image_path')}: {exc}", flush=True)

    query_photo_id = str(query.get("photo_id") or "")
    expected_catalog = str(query.get("catalog_id") or "")
    coarse_candidates = []
    for anchor in processed_anchors:
        aproc = anchor.get("processed")
        if aproc is None:
            continue
        if str(anchor.get("photo_id") or "") == query_photo_id:
            continue
        coarse_candidates.append({**anchor, **prefilter_scores(qproc, aproc)})

    coarse_candidates.sort(key=lambda row: row["coarse_score"], reverse=True)
    coarse_catalogs = aggregate_by_catalog(coarse_candidates, "coarse_score")
    coarse_rank = rank_of_catalog(coarse_catalogs, expected_catalog)

    selected, prefilter_info = select_multipass_prefilter(
        coarse_candidates,
        global_top_n=args.prefilter_top_n,
        zone_top_n=args.zone_prefilter_top_n,
        relaxed_top_n=args.relaxed_prefilter_top_n,
    )
    natural_selected_ids = {str(row.get("photo_id")) for row in selected}
    expected_in_prefilter = any(str(row.get("catalog_id")) == expected_catalog for row in selected)
    selected_ids = set(natural_selected_ids)
    forced_expected_count = 0
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
                **public_ref(anchor),
                "score": exact_score,
                "coarse_score": coarse_score,
                "final_score": final_score,
                "retrieval_score": float(anchor.get("retrieval_score", coarse_score)),
                "best_zone_score": float(anchor.get("best_zone_score", 0.0)),
                "relaxed_geometry_score": float(anchor.get("relaxed_geometry_score", 0.0)),
                "match_count": scored["match_count"],
                "pigment_iou": scored["pigment_iou"],
                "median_reprojection_error": scored["median_reprojection_error_norm"],
                "constellation_score": scored["constellation_score"],
                "constellation_bonus": scored["constellation_bonus"],
                "query_region_count": len(qproc.regions),
                "candidate_region_count": len(aproc.regions),
                "natural_prefilter_candidate": str(anchor.get("photo_id")) in natural_selected_ids,
            }
        )

    candidates.sort(key=lambda row: float(row.get("final_score") or 0.0), reverse=True)
    catalog_candidates = aggregate_by_catalog(candidates, "final_score")
    natural_catalog_candidates = aggregate_by_catalog(
        [row for row in candidates if row.get("natural_prefilter_candidate")],
        "final_score",
    )
    true_rank = rank_of_catalog(catalog_candidates, expected_catalog)
    natural_true_rank = rank_of_catalog(natural_catalog_candidates, expected_catalog)
    true_candidate = candidate_for_catalog(catalog_candidates, expected_catalog)
    return {
        "q_from_cache": q_from_cache,
        "query_metrics": qproc.metrics,
        "query_region_count": len(qproc.regions),
        "prefilter_info": prefilter_info,
        "coarse_rank": coarse_rank,
        "true_rank": true_rank,
        "natural_true_rank": natural_true_rank,
        "true_candidate": true_candidate,
        "expected_in_prefilter": expected_in_prefilter,
        "forced_expected_count": forced_expected_count,
        "catalog_candidates": catalog_candidates,
        "exact_candidates": candidates,
    }


def build_pair_case(
    *,
    out_root: Path,
    label: str,
    query: dict[str, str],
    candidate: dict[str, Any],
    enhance: bool,
    long_edge: int,
) -> dict[str, Any]:
    out_dir = out_root / label
    ensure_dir(out_dir)
    qproc = process_image(query["image_path"], long_edge=long_edge, enhance=enhance)
    cproc = process_image(str(candidate["image_path"]), long_edge=long_edge, enhance=enhance)
    result = score_match(qproc, cproc)
    query_debug = save_debug(qproc, out_dir / "query", "query")
    candidate_debug = save_debug(cproc, out_dir / "candidate", "candidate")
    overlay_path = out_dir / "pair_overlay.png"
    draw_pair_overlay(qproc, cproc, result).save(overlay_path)
    payload = {
        "label": label,
        "enhance": enhance,
        "query": public_ref(query),
        "candidate": public_ref(candidate),
        "score": result["score"],
        "match_count": result["match_count"],
        "pigment_iou": result["pigment_iou"],
        "median_reprojection_error_norm": result["median_reprojection_error_norm"],
        "normalized_weighted_regions": result["normalized_weighted_regions"],
        "spatial_spread": result["spatial_spread"],
        "zone_count": result["zone_count"],
        "zone_consistency": result["zone_consistency"],
        "constellation_score": result["constellation_score"],
        "constellation_bonus": result["constellation_bonus"],
        "rotation_invariant_constellation_score": result.get("rotation_invariant_constellation_score", 0.0),
        "rotation_invariant_constellation_pair_matches": result.get("rotation_invariant_constellation_pair_matches", 0),
        "rotation_invariant_constellation_coverage": result.get("rotation_invariant_constellation_coverage", 0.0),
        "rotation_invariant_constellation_bonus": result.get("rotation_invariant_constellation_bonus", 0.0),
        "rotation_invariant_constellation_bonus_raw": result.get("rotation_invariant_constellation_bonus_raw", 0.0),
        "rotation_invariant_triangle_score": result.get("rotation_invariant_triangle_score", 0.0),
        "rotation_invariant_triangle_matches": result.get("rotation_invariant_triangle_matches", 0),
        "rotation_invariant_triangle_coverage": result.get("rotation_invariant_triangle_coverage", 0.0),
        "large_region_penalty": result.get("large_region_penalty", 1.0),
        "query_important_region_coverage": result.get("query_important_region_coverage", 0.0),
        "candidate_important_region_coverage": result.get("candidate_important_region_coverage", 0.0),
        "query_large_region_coverage": result.get("query_large_region_coverage", 0.0),
        "candidate_large_region_coverage": result.get("candidate_large_region_coverage", 0.0),
        "query_large_region_count": result.get("query_large_region_count", 0),
        "candidate_large_region_count": result.get("candidate_large_region_count", 0),
        "tri_zone_coverage": result["tri_zone_coverage"],
        "tri_zone_matched_count": result["tri_zone_matched_count"],
        "rotation_degrees": result["transform_rotation_degrees"],
        "scale": result["transform_scale"],
        "anatomy_penalty": result["anatomy_penalty"],
        "query_region_count": len(qproc.regions),
        "candidate_region_count": len(cproc.regions),
        "query_rejected_region_count": len(qproc.rejected_regions),
        "candidate_rejected_region_count": len(cproc.rejected_regions),
        "query_quality_flags": qproc.metrics.get("signature_quality_flags", []),
        "candidate_quality_flags": cproc.metrics.get("signature_quality_flags", []),
        "query_rejected_reasons": qproc.metrics.get("rejected_region_reasons", {}),
        "candidate_rejected_reasons": cproc.metrics.get("rejected_region_reasons", {}),
        "query_zone_weights": qproc.metrics.get("signature_zone_weights", {}),
        "candidate_zone_weights": cproc.metrics.get("signature_zone_weights", {}),
        "matches": result["matches"],
        "debug_paths": {
            "query": query_debug,
            "candidate": candidate_debug,
            "pair_overlay": str(overlay_path),
        },
    }
    (out_dir / "pair_summary.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def interpret_case_pack(ranking: dict[str, Any] | None, pair_cases: list[dict[str, Any]]) -> dict[str, Any]:
    by_label = {case["label"]: case for case in pair_cases}
    normal_expected = by_label.get("normal_expected", {})
    normal_wrong = by_label.get("normal_top_wrong", {})
    enhanced_expected = by_label.get("enhanced_expected", {})
    enhanced_wrong = by_label.get("enhanced_top_wrong", {})
    flags: list[str] = []
    if ranking and ranking["expected_in_prefilter"] is False:
        flags.append("retrieval_failure")
    elif ranking and ranking["natural_true_rank"] and ranking["natural_true_rank"] > 20:
        flags.append("final_scoring_failure")
    if float(normal_expected.get("score") or 0.0) < float(normal_wrong.get("score") or 0.0):
        flags.append("false_candidate_scores_higher_pairwise")
    if float(enhanced_expected.get("score") or 0.0) > float(normal_expected.get("score") or 0.0) * 1.20:
        flags.append("enhancement_helps_expected_pair")
    if float(enhanced_wrong.get("score") or 0.0) > float(normal_wrong.get("score") or 0.0) * 1.20:
        flags.append("enhancement_also_helps_false_candidate")
    if normal_expected.get("query_quality_flags"):
        flags.append("query_signature_quality_issue")
    if normal_expected.get("candidate_quality_flags"):
        flags.append("expected_anchor_quality_issue")
    return {
        "flags": flags,
        "next_review_focus": recommend_focus(flags),
        "normal_expected_minus_wrong_score": float(normal_expected.get("score") or 0.0) - float(normal_wrong.get("score") or 0.0),
        "enhanced_expected_minus_wrong_score": float(enhanced_expected.get("score") or 0.0) - float(enhanced_wrong.get("score") or 0.0),
    }


def ranking_summary(ranking: dict[str, Any] | None, expected: dict[str, Any], top_wrong: dict[str, Any]) -> dict[str, Any]:
    if ranking is None:
        return {
            "mode": "targeted_pair_only",
            "expected_catalog_id": expected.get("catalog_id"),
            "expected_photo_id": expected.get("photo_id"),
            "top_wrong_catalog_id": top_wrong.get("catalog_id"),
            "top_wrong_photo_id": top_wrong.get("photo_id"),
        }
    return {
        "mode": "full_rank_reproduction",
        "natural_true_rank": ranking["natural_true_rank"],
        "oracle_true_rank": ranking["true_rank"],
        "coarse_rank": ranking["coarse_rank"],
        "expected_in_prefilter": ranking["expected_in_prefilter"],
        "forced_expected_count": ranking["forced_expected_count"],
        "top_catalog_id": ranking["catalog_candidates"][0].get("catalog_id") if ranking["catalog_candidates"] else None,
        "top_photo_id": ranking["catalog_candidates"][0].get("photo_id") if ranking["catalog_candidates"] else None,
        "top_final_score": ranking["catalog_candidates"][0].get("final_score") if ranking["catalog_candidates"] else None,
        "expected_catalog_id": expected.get("catalog_id"),
        "expected_photo_id": expected.get("photo_id"),
        "expected_final_score": expected.get("final_score"),
        "top_wrong_catalog_id": top_wrong.get("catalog_id"),
        "top_wrong_photo_id": top_wrong.get("photo_id"),
        "top_wrong_final_score": top_wrong.get("final_score"),
    }


def recommend_focus(flags: list[str]) -> str:
    if "retrieval_failure" in flags:
        return "prefilter_retrieval"
    if "query_signature_quality_issue" in flags:
        return "query_quality_or_enhancement"
    if "expected_anchor_quality_issue" in flags:
        return "multi_anchor_selection"
    if "false_candidate_scores_higher_pairwise" in flags:
        return "score_discriminants_and_false_positive_penalties"
    return "inspect_debug_overlays"


def write_ranking_outputs(out_root: Path, ranking: dict[str, Any], top_n: int) -> None:
    top = ranking["catalog_candidates"][:top_n]
    (out_root / "top_candidates.json").write_text(json.dumps(top, indent=2), encoding="utf-8")
    fields = [
        "rank",
        "catalog_id",
        "photo_id",
        "label",
        "score",
        "coarse_score",
        "final_score",
        "retrieval_score",
        "best_zone_score",
        "relaxed_geometry_score",
        "match_count",
        "pigment_iou",
        "median_reprojection_error",
        "constellation_score",
        "query_region_count",
        "candidate_region_count",
        "natural_prefilter_candidate",
        "image_path",
    ]
    with open(out_root / "top_candidates.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for rank, row in enumerate(top, 1):
            writer.writerow({field: row.get(field, rank if field == "rank" else "") for field in fields})


def first_wrong_candidate(rows: list[dict[str, Any]], expected_catalog: str) -> dict[str, Any] | None:
    for row in rows:
        if str(row.get("catalog_id")) != str(expected_catalog):
            return row
    return None


def candidate_for_catalog(rows: list[dict[str, Any]], catalog_id: str) -> dict[str, Any] | None:
    for row in rows:
        if str(row.get("catalog_id")) == str(catalog_id):
            return row
    return None


def rank_of_catalog(rows: list[dict[str, Any]], catalog_id: str) -> int | None:
    for rank, row in enumerate(rows, 1):
        if str(row.get("catalog_id")) == str(catalog_id):
            return rank
    return None


def public_ref(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "catalog_id": row.get("catalog_id"),
        "photo_id": row.get("photo_id"),
        "image_path": row.get("image_path"),
        "label": row.get("label") or Path(str(row.get("image_path") or "")).name,
    }


if __name__ == "__main__":
    main()
