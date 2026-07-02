#!/usr/bin/env python3
"""Local HTTP worker for deterministic manta matcher testing.

This is intentionally local-only. It gives the React admin page a small bridge
to the Python matcher without moving the core algorithm into a browser or cloud
function.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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
    score_match,
    select_multipass_prefilter,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8766


class MatcherState:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.anchors: list[dict[str, Any]] | None = None
        self.loaded_at = 0.0
        self.anchor_load_status = "idle"
        self.anchor_load_total = 0
        self.anchor_load_processed = 0
        self.anchor_load_current: dict[str, str] | None = None
        self.anchor_load_error = ""
        self.rank_status = "idle"
        self.rank_total = 0
        self.rank_processed = 0
        self.rank_current: dict[str, str] | None = None
        self.result_cache: dict[str, dict[str, Any]] = {}
        self.result_cache_order: list[str] = []
        self._load_lock = threading.Lock()
        self._preload_thread: threading.Thread | None = None

    def get_cached_result(self, key: str) -> dict[str, Any] | None:
        cached = self.result_cache.get(key)
        if cached is None:
            return None
        payload = json.loads(json.dumps(cached))
        summary = payload.setdefault("summary", {})
        summary["from_memory_cache"] = True
        return payload

    def remember_result(self, key: str, payload: dict[str, Any]) -> None:
        self.result_cache[key] = json.loads(json.dumps(payload))
        if key in self.result_cache_order:
            self.result_cache_order.remove(key)
        self.result_cache_order.append(key)
        while len(self.result_cache_order) > self.args.result_cache_size:
            old_key = self.result_cache_order.pop(0)
            self.result_cache.pop(old_key, None)

    def load_anchors(self) -> list[dict[str, Any]]:
        with self._load_lock:
            if self.anchors is not None:
                return self.anchors

            anchors = build_catalog_from_manifest(self.args.manifest, self.args.image_dir)
            for extra in self.args.extra_anchors_csv:
                anchors.extend(read_queries(extra, role="anchor"))
            anchors = dedupe_anchors(anchors)
            self.anchor_load_status = "loading"
            self.anchor_load_total = len(anchors)
            self.anchor_load_processed = 0
            self.anchor_load_current = None
            self.anchor_load_error = ""

            loaded: list[dict[str, Any]] = []
            for idx, anchor in enumerate(anchors, 1):
                self.anchor_load_processed = idx - 1
                self.anchor_load_current = {
                    "catalog_id": str(anchor.get("catalog_id") or ""),
                    "photo_id": str(anchor.get("photo_id") or ""),
                    "image_path": rel_path(anchor.get("image_path", "")),
                }
                try:
                    proc, _, from_cache = load_or_create_signature(
                        anchor,
                        self.args.cache_dir,
                        self.args.long_edge,
                        self.args.refresh_cache,
                    )
                    loaded.append({**anchor, "processed": proc, "from_cache": from_cache, "error": None})
                    if idx == 1 or idx == len(anchors) or idx % self.args.anchor_log_every == 0:
                        print(
                            f"[matcher-api] anchor {idx}/{len(anchors)} catalog={anchor.get('catalog_id')} "
                            f"photo={anchor.get('photo_id')} regions={len(proc.regions)}",
                            flush=True,
                        )
                except Exception as exc:
                    loaded.append({**anchor, "processed": None, "error": str(exc)})
                    print(f"[matcher-api] anchor ERROR {anchor.get('image_path')}: {exc}", flush=True)
                finally:
                    self.anchor_load_processed = idx

            self.anchors = loaded
            self.loaded_at = time.time()
            self.anchor_load_status = "loaded"
            self.anchor_load_current = None
            return loaded

    def preload_anchors_async(self) -> None:
        if self._preload_thread and self._preload_thread.is_alive():
            return

        def run() -> None:
            try:
                self.load_anchors()
            except Exception as exc:
                self.anchor_load_status = "error"
                self.anchor_load_error = str(exc)
                self.anchor_load_current = None
                print(f"[matcher-api] preload ERROR: {exc}", flush=True)

        self._preload_thread = threading.Thread(target=run, name="matcher-anchor-preload", daemon=True)
        self._preload_thread.start()


def rel_path(path: str | Path) -> str:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    try:
        return str(p.resolve().relative_to(ROOT))
    except ValueError:
        return str(p.resolve())


def file_url(path: str | Path) -> str:
    return f"/matcher-file?path={urllib.parse.quote(rel_path(path))}"


def read_manifest_rows(path: str | Path, limit: int = 200) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    manifest = Path(path)
    if not manifest.is_absolute():
        manifest = ROOT / manifest
    if not manifest.exists():
        return out
    base_dir = manifest.parent
    with open(manifest, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            filename = row.get("output_filename", "")
            image_path = str(base_dir / filename) if filename else ""
            if image_path and not Path(image_path).exists():
                continue
            out.append(
                {
                    "catalog_id": str(row.get("catalog_id") or row.get("fk_catalog_id") or row.get("pk_catalog_id") or ""),
                    "photo_id": str(row.get("photo_id") or row.get("pk_photo_id") or ""),
                    "label": filename,
                    "image_path": rel_path(image_path),
                    "image_url": file_url(image_path),
                }
            )
            if len(out) >= limit:
                break
    return out


def query_path_from_body(body: dict[str, Any]) -> Path:
    query_path = str(body.get("query_path") or "").strip()
    if query_path:
        qpath = Path(query_path)
        if not qpath.is_absolute():
            qpath = ROOT / qpath
        return qpath

    query_url = str(body.get("query_url") or "").strip()
    if not query_url:
        raise ValueError("query_path or query_url is required")
    parsed = urllib.parse.urlparse(query_url)
    if parsed.scheme == "blob":
        raise ValueError("blob: URLs are browser-local. Use the uploaded/public image URL for matching.")
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("query_url must be http or https")

    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    temp_dir = ROOT / "scripts/matching/output/admin_test_matcher/query_uploads"
    ensure_dir(temp_dir)
    url_hash = hashlib.sha256(query_url.encode("utf-8")).hexdigest()[:20]
    tmp_path = temp_dir / f"query_url_{url_hash}{suffix}"
    if tmp_path.exists() and tmp_path.stat().st_size > 0:
        return tmp_path
    request = urllib.request.Request(query_url, headers={"User-Agent": "manta-local-matcher/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        tmp_path.write_bytes(response.read())
    return tmp_path


class Handler(BaseHTTPRequestHandler):
    state: MatcherState

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            anchors = self.state.anchors
            self.json_response(
                {
                    "ok": True,
                    "service": "local-manta-matcher",
                    "anchors_loaded": len(anchors) if anchors is not None else 0,
                    "anchor_load_status": self.state.anchor_load_status,
                    "anchor_load_processed": self.state.anchor_load_processed,
                    "anchor_load_total": self.state.anchor_load_total,
                    "anchor_load_current": self.state.anchor_load_current,
                    "anchor_load_error": self.state.anchor_load_error,
                    "rank_status": self.state.rank_status,
                    "rank_processed": self.state.rank_processed,
                    "rank_total": self.state.rank_total,
                    "rank_current": self.state.rank_current,
                    "loaded_at": self.state.loaded_at,
                }
            )
            return
        if parsed.path == "/queries":
            qs = urllib.parse.parse_qs(parsed.query)
            limit = int((qs.get("limit") or ["200"])[0])
            self.json_response({"queries": read_manifest_rows(self.state.args.query_manifest, limit)})
            return
        if parsed.path == "/matcher-file":
            self.serve_file(parsed)
            return
        self.json_response({"error": "not_found"}, status=404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/rank":
            self.json_response({"error": "not_found"}, status=404)
            return
        try:
            length = int(self.headers.get("Content-Length") or "0")
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            payload = self.rank(body)
            self.json_response(payload)
        except Exception as exc:
            self.json_response({"error": str(exc)}, status=500)

    def serve_file(self, parsed: urllib.parse.ParseResult) -> None:
        qs = urllib.parse.parse_qs(parsed.query)
        raw = urllib.parse.unquote((qs.get("path") or [""])[0])
        path = Path(raw)
        if not path.is_absolute():
            path = ROOT / path
        resolved = path.resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError:
            self.json_response({"error": "file_outside_repo"}, status=403)
            return
        if not resolved.exists() or not resolved.is_file():
            self.json_response({"error": "file_not_found"}, status=404)
            return
        ctype = "image/png" if resolved.suffix.lower() == ".png" else "image/jpeg"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(resolved.read_bytes())

    def rank(self, body: dict[str, Any]) -> dict[str, Any]:
        qpath = query_path_from_body(body)
        if not qpath.exists():
            raise FileNotFoundError(str(qpath))

        top_k = max(1, min(150, int(body.get("top_k") or 10)))
        prefilter_top_n = max(0, min(700, int(body.get("prefilter_top_n") or self.state.args.prefilter_top_n)))
        zone_prefilter_top_n = max(0, min(500, int(body.get("zone_prefilter_top_n") or self.state.args.zone_prefilter_top_n)))
        relaxed_prefilter_top_n = max(0, min(700, int(body.get("relaxed_prefilter_top_n") or self.state.args.relaxed_prefilter_top_n)))
        coarse_score_weight = float(body.get("coarse_score_weight") or self.state.args.coarse_score_weight)
        coarse_bonus_cap = float(body.get("coarse_bonus_cap") or self.state.args.coarse_bonus_cap)
        cache_key = json.dumps(
            {
                "query_path": str(qpath.resolve()),
                "mtime_ns": qpath.stat().st_mtime_ns,
                "size": qpath.stat().st_size,
                "top_k": top_k,
                "prefilter_top_n": prefilter_top_n,
                "zone_prefilter_top_n": zone_prefilter_top_n,
                "relaxed_prefilter_top_n": relaxed_prefilter_top_n,
                "coarse_score_weight": round(coarse_score_weight, 6),
                "coarse_bonus_cap": round(coarse_bonus_cap, 6),
                "query_photo_id": str(body.get("query_photo_id") or ""),
                "expected_catalog_id": str(body.get("expected_catalog_id") or ""),
            },
            sort_keys=True,
        )
        cached = self.state.get_cached_result(cache_key)
        if cached is not None:
            return cached

        query_ref = {
            "catalog_id": str(body.get("expected_catalog_id") or ""),
            "photo_id": str(body.get("query_photo_id") or ""),
            "image_path": str(qpath),
            "label": qpath.name,
        }
        qproc, _, _ = load_or_create_signature(query_ref, self.state.args.cache_dir, self.state.args.long_edge, False)

        anchors = self.state.load_anchors()
        query_photo_id = str(body.get("query_photo_id") or "")
        expected_catalog_id = str(body.get("expected_catalog_id") or "")
        coarse_candidates = []
        for anchor in anchors:
            aproc = anchor.get("processed")
            if aproc is None:
                continue
            if query_photo_id and str(anchor.get("photo_id")) == query_photo_id:
                continue
            coarse_candidates.append({**anchor, **prefilter_scores(qproc, aproc)})
        coarse_candidates.sort(key=lambda row: row["coarse_score"], reverse=True)
        coarse_catalog_candidates = aggregate_by_catalog(coarse_candidates, "coarse_score")
        coarse_expected_rank = None
        if expected_catalog_id:
            for rank, row in enumerate(coarse_catalog_candidates, 1):
                if str(row.get("catalog_id")) == expected_catalog_id:
                    coarse_expected_rank = rank
                    break
        selected, prefilter_info = select_multipass_prefilter(
            coarse_candidates,
            global_top_n=prefilter_top_n,
            zone_top_n=zone_prefilter_top_n,
            relaxed_top_n=relaxed_prefilter_top_n,
        )
        natural_selected_ids = {str(row.get("photo_id") or "") for row in selected}
        expected_in_prefilter = any(str(row.get("catalog_id")) == expected_catalog_id for row in selected) if expected_catalog_id else False
        if expected_catalog_id and prefilter_top_n:
            selected_photo_ids = set(natural_selected_ids)
            for candidate in coarse_candidates:
                if str(candidate.get("catalog_id")) == expected_catalog_id and str(candidate.get("photo_id") or "") not in selected_photo_ids:
                    selected.append(candidate)
                    selected_photo_ids.add(str(candidate.get("photo_id") or ""))

        candidates = []
        self.state.rank_status = "scoring"
        self.state.rank_total = len(selected)
        self.state.rank_processed = 0
        self.state.rank_current = None
        try:
            for idx, anchor in enumerate(selected, 1):
                self.state.rank_processed = idx - 1
                self.state.rank_current = {
                    "catalog_id": str(anchor.get("catalog_id") or ""),
                    "photo_id": str(anchor.get("photo_id") or ""),
                }
                aproc = anchor.get("processed")
                if aproc is None:
                    continue
                scored = score_match(qproc, aproc)
                final_score = blended_final_score(
                    float(scored["score"]),
                    float(anchor.get("coarse_score", 0.0)),
                    coarse_score_weight,
                    coarse_bonus_cap,
                )
                candidates.append(
                    {
                        **{k: v for k, v in anchor.items() if k != "processed"},
                        "score": float(scored["score"]),
                        "coarse_score": float(anchor.get("coarse_score", 0.0)),
                        "retrieval_score": float(anchor.get("retrieval_score", anchor.get("coarse_score", 0.0))),
                        "best_zone_score": float(anchor.get("best_zone_score", 0.0)),
                        "relaxed_geometry_score": float(anchor.get("relaxed_geometry_score", 0.0)),
                        "gill_chest_score": float(anchor.get("gill_chest_score", 0.0)),
                        "central_belly_score": float(anchor.get("central_belly_score", 0.0)),
                        "pelvic_belly_score": float(anchor.get("pelvic_belly_score", 0.0)),
                        "final_score": final_score,
                        "match_count": int(scored["match_count"]),
                        "pigment_iou": float(scored["pigment_iou"]),
                        "median_reprojection_error": float(scored["median_reprojection_error_norm"]),
                        "constellation_score": float(scored.get("constellation_score", 0.0)),
                        "constellation_bonus": float(scored.get("constellation_bonus", 0.0)),
                        "tri_zone_matched_count": int(scored.get("tri_zone_matched_count", 0)),
                        "tri_zone_coverage": float(scored.get("tri_zone_coverage", 0.0)),
                        "large_region_penalty": float(scored.get("large_region_penalty", 1.0)),
                        "query_important_region_coverage": float(scored.get("query_important_region_coverage", 0.0)),
                        "candidate_important_region_coverage": float(scored.get("candidate_important_region_coverage", 0.0)),
                        "regional_mean_coverage": float(scored.get("regional_mean_coverage", 0.0)),
                        "regional_imbalance": float(scored.get("regional_imbalance", 0.0)),
                        "orientation_normalized_regional_score": float(scored.get("orientation_normalized_regional_score", 0.0)),
                        "orientation_normalized_regional_mode": str(scored.get("orientation_normalized_regional_mode", "")),
                        "orientation_match_mode": str(scored.get("orientation_match_mode", "")),
                        "regional_red_flags": scored.get("regional_red_flags", []),
                        "image_url": file_url(anchor.get("image_path", "")),
                        "_processed": aproc,
                        "_scored": scored,
                    }
                )
                self.state.rank_processed = idx
        finally:
            self.state.rank_status = "idle"
            self.state.rank_current = None

        candidates.sort(key=lambda row: row["final_score"], reverse=True)
        catalog_candidates = aggregate_by_catalog(candidates, "final_score")
        natural_catalog_candidates = aggregate_by_catalog(
            [row for row in candidates if str(row.get("photo_id") or "") in natural_selected_ids],
            "final_score",
        )
        expected_rank = None
        expected_candidate = None
        if expected_catalog_id:
            for rank, row in enumerate(natural_catalog_candidates, 1):
                if str(row.get("catalog_id")) == expected_catalog_id:
                    expected_rank = rank
                    expected_candidate = row
                    break
            if expected_candidate is None:
                for rank, row in enumerate(catalog_candidates, 1):
                    if str(row.get("catalog_id")) == expected_catalog_id:
                        expected_candidate = row
                        break
        top = natural_catalog_candidates[:top_k]

        run_dir = ROOT / self.state.args.output_dir / f"manual_{int(time.time())}"
        ensure_dir(run_dir)
        response_top = []
        for rank, row in enumerate(top, 1):
            overlay_path = ""
            aproc = row.get("_processed")
            scored = row.get("_scored")
            if aproc is not None and scored is not None and rank <= min(10, top_k):
                overlay = draw_pair_overlay(qproc, aproc, scored)
                opath = run_dir / f"rank_{rank:02d}_catalog_{row.get('catalog_id')}_photo_{row.get('photo_id')}.png"
                overlay.save(opath)
                overlay_path = rel_path(opath)
            clean = {k: v for k, v in row.items() if not k.startswith("_")}
            clean.update({"rank": rank, "overlay_path": overlay_path, "overlay_url": file_url(overlay_path) if overlay_path else ""})
            response_top.append(clean)

        summary = {
            "query_path": rel_path(qpath),
            "query_url": file_url(qpath),
            "query_region_count": len(qproc.regions),
            "query_signature_usable": bool(qproc.metrics.get("signature_usable")),
            "query_signature_quality_flags": qproc.metrics.get("signature_quality_flags", []),
            "anchor_count": len(anchors),
            "prefilter_count": len(selected),
            "natural_prefilter_count": len(natural_selected_ids),
            "coarse_score_weight": coarse_score_weight,
            "coarse_bonus_cap": coarse_bonus_cap,
            "top_k": top_k,
            "expected_catalog_id": expected_catalog_id,
            "expected_catalog_rank": expected_rank,
            "expected_catalog_in_top_k": bool(expected_rank is not None and expected_rank <= top_k),
            "expected_catalog_in_prefilter": bool(expected_in_prefilter),
            "expected_catalog_photo_id": str(expected_candidate.get("photo_id") or "") if expected_candidate else "",
            "expected_catalog_score": float(expected_candidate.get("final_score", 0.0)) if expected_candidate else None,
            "coarse_expected_catalog_rank": coarse_expected_rank,
            "ranked_catalog_count": len(natural_catalog_candidates),
            "oracle_expected_catalog_rank": next(
                (rank for rank, row in enumerate(catalog_candidates, 1) if str(row.get("catalog_id")) == expected_catalog_id),
                None,
            )
            if expected_catalog_id
            else None,
            "oracle_ranked_catalog_count": len(catalog_candidates),
            "zone_prefilter_top_n": zone_prefilter_top_n,
            "relaxed_prefilter_top_n": relaxed_prefilter_top_n,
            "prefilter_mode": prefilter_info.get("prefilter_mode"),
            "prefilter_selected_by_pass": prefilter_info.get("selected_by_pass", {}),
            "generated_dir": rel_path(run_dir),
            "from_memory_cache": False,
        }
        payload = {"summary": summary, "top": response_top}
        (run_dir / "rank_response.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self.state.remember_result(cache_key, payload)
        return payload

    def json_response(self, payload: dict[str, Any], status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[matcher-api] {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local deterministic matcher API server")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--manifest", default="export/best_catalog_photos/manifest.csv")
    parser.add_argument("--image-dir", default="export/best_catalog_photos")
    parser.add_argument("--query-manifest", default="export/best_manta_ventral_photos_100/manifest.csv")
    parser.add_argument("--extra-anchors-csv", action="append", default=["export/best_manta_ventral_photos_100/manifest.csv"])
    parser.add_argument("--cache-dir", default="scripts/matching/cache/photo_signatures")
    parser.add_argument("--output-dir", default="scripts/matching/output/admin_test_matcher")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--prefilter-top-n", type=int, default=120)
    parser.add_argument("--zone-prefilter-top-n", type=int, default=80)
    parser.add_argument("--relaxed-prefilter-top-n", type=int, default=300)
    parser.add_argument("--coarse-score-weight", type=float, default=0.20)
    parser.add_argument("--coarse-bonus-cap", type=float, default=8.0)
    parser.add_argument("--anchor-log-every", type=int, default=100)
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument("--preload-anchors", action="store_true")
    parser.add_argument("--result-cache-size", type=int, default=12)
    args = parser.parse_args()

    Handler.state = MatcherState(args)
    if args.preload_anchors:
        Handler.state.preload_anchors_async()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[matcher-api] listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
