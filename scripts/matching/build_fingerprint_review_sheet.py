#!/usr/bin/env python3
"""Build a compact visual review sheet for one matcher case pack.

This is a scientist/admin feedback aid. It does not run ranking or change
scores; it takes an existing low-performer case pack and lays out what the
matcher fingerprinted for the query, expected match, and top wrong match.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


CARD_W = 360
IMAGE_H = 250
GAP = 18
MARGIN = 24
HEADER_H = 120
SECTION_TITLE_H = 42
PAIR_H = 330


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a compact fingerprint review sheet.")
    parser.add_argument("--case-dir", required=True, help="Existing case-pack directory.")
    parser.add_argument("--variant", default="normal", choices=("normal", "enhanced"))
    parser.add_argument("--out-dir", default="", help="Output directory. Defaults to case-dir.")
    args = parser.parse_args()

    case_dir = Path(args.case_dir)
    if not case_dir.exists():
        raise SystemExit(f"Case directory not found: {case_dir}")

    out_dir = Path(args.out_dir) if args.out_dir else case_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = read_json(case_dir / "case_summary.json")
    expected_dir = case_dir / f"{args.variant}_expected"
    wrong_dir = case_dir / f"{args.variant}_top_wrong"
    if not expected_dir.exists() or not wrong_dir.exists():
        raise SystemExit(f"Missing {args.variant}_expected or {args.variant}_top_wrong under {case_dir}")

    expected_pair = read_json(expected_dir / "pair_summary.json")
    wrong_pair = read_json(wrong_dir / "pair_summary.json")
    review = {
        "case_dir": str(case_dir),
        "variant": args.variant,
        "query": summary.get("query", {}),
        "expected_pair": summarize_pair(expected_pair),
        "top_wrong_pair": summarize_pair(wrong_pair),
        "notes": [
            "Colored contours/boxes are accepted pigment regions.",
            "White mask/cutout panels show the body segmentation used before pigment detection.",
            "Pair overlays show which accepted regions drove the score.",
        ],
    }

    sheet = build_sheet(case_dir, args.variant, summary, expected_pair, wrong_pair)
    sheet_path = out_dir / f"fingerprint_review_{args.variant}.png"
    json_path = out_dir / f"fingerprint_review_{args.variant}.json"
    sheet.save(sheet_path)
    json_path.write_text(json.dumps(review, indent=2), encoding="utf-8")
    print(json.dumps({"sheet": str(sheet_path), "json": str(json_path)}, indent=2), flush=True)


def build_sheet(
    case_dir: Path,
    variant: str,
    summary: dict[str, Any],
    expected_pair: dict[str, Any],
    wrong_pair: dict[str, Any],
) -> Image.Image:
    width = MARGIN * 2 + CARD_W * 3 + GAP * 2
    rows = 3
    height = HEADER_H + rows * (SECTION_TITLE_H + IMAGE_H + 8) + SECTION_TITLE_H + PAIR_H + MARGIN
    sheet = Image.new("RGB", (width, height), (242, 246, 249))
    draw = ImageDraw.Draw(sheet)

    query = summary.get("query", {})
    ranking = summary.get("ranking", {})
    title = f"Matcher Fingerprint Review: Query photo {query.get('photo_id', '?')} / catalog {query.get('catalog_id', '?')}"
    draw.text((MARGIN, 20), title, fill=(20, 30, 40))
    expected_label = f"expected catalog {ranking.get('expected_catalog_id', query.get('catalog_id', '?'))} / photo {ranking.get('expected_photo_id', '?')}"
    wrong_label = f"top wrong catalog {ranking.get('top_wrong_catalog_id', '?')} / photo {ranking.get('top_wrong_photo_id', '?')}"
    if ranking.get("expected_rank"):
        expected_label += f" / rank {ranking.get('expected_rank')}"
    draw.text((MARGIN, 48), f"Variant: {variant}. {expected_label}. {wrong_label}.", fill=(60, 75, 90))
    draw.text((MARGIN, 76), "Use this to mark false pigment, missed true pigment, and bad masks/ROI. This sheet does not alter scores.", fill=(60, 75, 90))

    labels = ["Query", "Expected Same Catalog", "Top Wrong Candidate"]
    y = HEADER_H
    y = add_three_panel_row(
        sheet,
        y,
        "1. Original Images",
        labels,
        [
            case_dir / f"{variant}_expected/query/query_01_original.png",
            case_dir / f"{variant}_expected/candidate/candidate_01_original.png",
            case_dir / f"{variant}_top_wrong/candidate/candidate_01_original.png",
        ],
    )
    y = add_three_panel_row(
        sheet,
        y,
        "2. Body Mask / Cutout",
        labels,
        [
            case_dir / f"{variant}_expected/query/query_03_body_cutout.png",
            case_dir / f"{variant}_expected/candidate/candidate_03_body_cutout.png",
            case_dir / f"{variant}_top_wrong/candidate/candidate_03_body_cutout.png",
        ],
    )
    y = add_three_panel_row(
        sheet,
        y,
        "3. Accepted Pigment Regions",
        labels,
        [
            case_dir / f"{variant}_expected/query/query_08_regions.png",
            case_dir / f"{variant}_expected/candidate/candidate_08_regions.png",
            case_dir / f"{variant}_top_wrong/candidate/candidate_08_regions.png",
        ],
    )

    draw = ImageDraw.Draw(sheet)
    draw.text((MARGIN, y + 10), "4. What Drove the Match Score", fill=(20, 30, 40))
    y += SECTION_TITLE_H
    expected_overlay = load_panel(case_dir / f"{variant}_expected/pair_overlay.png", width // 2 - MARGIN - GAP // 2, PAIR_H)
    wrong_overlay = load_panel(case_dir / f"{variant}_top_wrong/pair_overlay.png", width // 2 - MARGIN - GAP // 2, PAIR_H)
    sheet.paste(expected_overlay, (MARGIN, y))
    sheet.paste(wrong_overlay, (MARGIN + expected_overlay.width + GAP, y))
    draw.rectangle((MARGIN, y, MARGIN + expected_overlay.width - 1, y + expected_overlay.height - 1), outline=(190, 202, 214))
    draw.rectangle((MARGIN + expected_overlay.width + GAP, y, MARGIN + expected_overlay.width + GAP + wrong_overlay.width - 1, y + wrong_overlay.height - 1), outline=(190, 202, 214))
    draw_metrics_box(draw, MARGIN + 10, y + 10, "Expected Match", expected_pair)
    draw_metrics_box(draw, MARGIN + expected_overlay.width + GAP + 10, y + 10, "Top Wrong Match", wrong_pair)
    return sheet


def add_three_panel_row(
    sheet: Image.Image,
    y: int,
    title: str,
    labels: list[str],
    paths: list[Path],
) -> int:
    draw = ImageDraw.Draw(sheet)
    draw.text((MARGIN, y + 10), title, fill=(20, 30, 40))
    y += SECTION_TITLE_H
    for idx, path in enumerate(paths):
        x = MARGIN + idx * (CARD_W + GAP)
        panel = load_panel(path, CARD_W, IMAGE_H - 28)
        card = Image.new("RGB", (CARD_W, IMAGE_H), (255, 255, 255))
        cd = ImageDraw.Draw(card)
        cd.text((10, 8), labels[idx], fill=(40, 52, 64))
        card.paste(panel, ((CARD_W - panel.width) // 2, 28 + (IMAGE_H - 28 - panel.height) // 2))
        cd.rectangle((0, 0, CARD_W - 1, IMAGE_H - 1), outline=(198, 210, 222))
        sheet.paste(card, (x, y))
    return y + IMAGE_H + 8


def load_panel(path: Path, max_w: int, max_h: int) -> Image.Image:
    if not path.exists():
        img = Image.new("RGB", (max_w, max_h), (252, 236, 236))
        draw = ImageDraw.Draw(img)
        draw.text((12, 12), f"Missing:\n{path.name}", fill=(120, 40, 40))
        return img
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    return img


def draw_metrics_box(draw: ImageDraw.ImageDraw, x: int, y: int, title: str, pair: dict[str, Any]) -> None:
    lines = [
        title,
        f"score: {fmt(pair.get('score'))}",
        f"matches: {pair.get('match_count', '?')}",
        f"pigment IoU: {fmt(pair.get('pigment_iou'))}",
        f"median error: {fmt(pair.get('median_reprojection_error_norm'))}",
        f"constellation: {fmt(pair.get('matched_constellation_score'))}",
    ]
    box_w = 250
    box_h = 118
    draw.rectangle((x, y, x + box_w, y + box_h), fill=(255, 255, 255), outline=(170, 185, 200))
    for idx, line in enumerate(lines):
        fill = (20, 30, 40) if idx == 0 else (55, 70, 85)
        draw.text((x + 10, y + 8 + idx * 17), line, fill=fill)


def summarize_pair(pair: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "score",
        "match_count",
        "pigment_iou",
        "median_reprojection_error_norm",
        "constellation_score",
        "matched_constellation_score",
        "matched_constellation_pair_count",
        "matched_area_weight",
        "spatial_spread",
        "query_region_count",
        "candidate_region_count",
        "query_body_mask_confidence",
        "candidate_body_mask_confidence",
    ]
    return {key: pair.get(key) for key in keys if key in pair}


def fmt(value: Any) -> str:
    try:
        return f"{float(value):.4f}"
    except (TypeError, ValueError):
        return "n/a"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
