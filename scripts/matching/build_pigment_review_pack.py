#!/usr/bin/env python3
"""Build a small human-review pack of pigment-region overlays.

The pack is intended for scientist/admin feedback: show what the deterministic
detector currently calls pigmentation on high-performing and low-performing
match examples.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from pigment_region_matcher import (
    DEFAULT_LONG_EDGE,
    draw_regions,
    ensure_dir,
    process_image,
    save_debug,
)


HIGH_EXAMPLES = [
    ("high", "query_5_catalog_1_rank_1", "export/best_manta_ventral_photos_100/1_manta-11_photo-5.jpg"),
    ("high", "query_6_catalog_7_rank_1", "export/best_manta_ventral_photos_100/7_manta-12_photo-6.jpg"),
    ("high", "query_7_catalog_8_rank_1", "export/best_manta_ventral_photos_100/8_manta-13_photo-7.jpg"),
    ("high", "query_25_catalog_4_rank_4", "export/best_manta_ventral_photos_100/4_manta-26_photo-25.jpg"),
    ("high", "query_65_catalog_10_rank_1", "export/best_manta_ventral_photos_100/10_manta-64_photo-65.jpg"),
    ("high", "catalog_4_anchor_photo_306", "export/best_manta_ventral_photos_100/4_manta-262_photo-306.jpg"),
]

LOW_EXAMPLES = [
    ("low", "query_14_catalog_2_rank_26", "export/best_manta_ventral_photos_100/2_manta-15_photo-14.jpg"),
    ("low", "query_21_catalog_3_rank_138", "export/best_manta_ventral_photos_100/3_manta-22_photo-21.jpg"),
    ("low", "query_26_catalog_5_rank_49", "export/best_manta_ventral_photos_100/5_manta-27_photo-26.jpg"),
    ("low", "query_32_catalog_6_rank_74", "export/best_manta_ventral_photos_100/6_manta-33_photo-32.jpg"),
    ("low", "query_8_catalog_9_rank_170", "export/best_manta_ventral_photos_100/9_manta-14_photo-8.jpg"),
    ("low", "catalog_2_photo_1704_zero_regions", "export/best_manta_ventral_photos_100/2_manta-1157_photo-1704.jpg"),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pigment-region overlay review pack.")
    parser.add_argument("--out-dir", default="scripts/matching/output/pigment_review_pack")
    parser.add_argument("--long-edge", type=int, default=DEFAULT_LONG_EDGE)
    parser.add_argument("--enhance", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    ensure_dir(out_dir)
    rows: list[dict[str, Any]] = []
    cards: list[tuple[str, Image.Image]] = []
    for group, label, image_path in HIGH_EXAMPLES + LOW_EXAMPLES:
        path = Path(image_path)
        case_dir = out_dir / group / label
        ensure_dir(case_dir)
        if not path.exists():
            rows.append({"group": group, "label": label, "image_path": image_path, "status": "missing"})
            continue
        proc = process_image(path, long_edge=args.long_edge, enhance=args.enhance)
        debug_paths = save_debug(proc, case_dir, label)
        overlay = draw_regions(proc)
        card = make_card(overlay, group, label, proc)
        overlay_path = case_dir / "pigment_regions_overlay.png"
        card_path = case_dir / "review_card.png"
        overlay.save(overlay_path)
        card.save(card_path)
        cards.append((label, card))
        rows.append(
            {
                "group": group,
                "label": label,
                "image_path": image_path,
                "status": "ok",
                "accepted_region_count": len(proc.regions),
                "rejected_region_count": len(proc.rejected_regions),
                "quality_flags": "|".join(proc.metrics.get("signature_quality_flags", [])),
                "overlay_path": str(overlay_path),
                "card_path": str(card_path),
                "regions_json": debug_paths.get("regions_json", ""),
            }
        )
    write_manifest(out_dir / "manifest.csv", rows)
    (out_dir / "manifest.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    make_contact_sheet(cards, out_dir / "contact_sheet.png")
    make_body_sheet(out_dir, rows, out_dir / "body_mask_contact_sheet.png")
    print(json.dumps({"out_dir": str(out_dir), "image_count": len(cards), "contact_sheet": str(out_dir / "contact_sheet.png")}, indent=2), flush=True)


def make_card(img: Image.Image, group: str, label: str, proc: Any) -> Image.Image:
    img = img.convert("RGB")
    max_w = 720
    scale = min(1.0, max_w / img.width)
    if scale < 1.0:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
    title_h = 74
    out = Image.new("RGB", (img.width, img.height + title_h), (245, 248, 250))
    out.paste(img, (0, title_h))
    d = ImageDraw.Draw(out)
    d.text((12, 10), f"{group.upper()}  {label}", fill=(20, 30, 40))
    flags = ",".join(proc.metrics.get("signature_quality_flags", [])) or "none"
    d.text((12, 34), f"accepted={len(proc.regions)} rejected={len(proc.rejected_regions)} flags={flags}", fill=(55, 70, 85))
    d.text((12, 54), "Yellow box=ROI; colored contours/boxes=accepted pigment regions", fill=(55, 70, 85))
    return out


def make_contact_sheet(cards: list[tuple[str, Image.Image]], out_path: Path) -> None:
    if not cards:
        return
    thumb_w = 420
    thumb_h = 420
    cols = 3
    rows = (len(cards) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (235, 239, 243))
    for idx, (_, card) in enumerate(cards):
        thumb = card.copy()
        thumb.thumbnail((thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
        x = (idx % cols) * thumb_w + (thumb_w - thumb.width) // 2
        y = (idx // cols) * thumb_h + (thumb_h - thumb.height) // 2
        sheet.paste(thumb, (x, y))
    sheet.save(out_path)


def make_body_sheet(out_dir: Path, rows: list[dict[str, Any]], out_path: Path) -> None:
    cards: list[Image.Image] = []
    for row in rows:
        if row.get("status") != "ok":
            continue
        group = str(row["group"])
        label = str(row["label"])
        case_dir = out_dir / group / label
        original = next(case_dir.glob("*_01_original.png"), None)
        overlay = next(case_dir.glob("*_04_body_overlay.png"), None)
        cutout = next(case_dir.glob("*_03_body_cutout.png"), None)
        roi = next(case_dir.glob("*_05_roi_overlay.png"), None)
        images = [p for p in (original, overlay, cutout, roi) if p is not None and p.exists()]
        if not images:
            continue
        thumbs = [Image.open(p).convert("RGB") for p in images]
        for img in thumbs:
            img.thumbnail((260, 210), Image.Resampling.LANCZOS)
        title_h = 50
        w = 260 * len(thumbs)
        h = title_h + max(img.height for img in thumbs)
        card = Image.new("RGB", (w, h), (245, 248, 250))
        draw = ImageDraw.Draw(card)
        draw.text((8, 8), f"{group.upper()} {label}", fill=(20, 30, 40))
        draw.text((8, 28), "original | body overlay | cutout | ROI", fill=(65, 80, 95))
        x = 0
        for img in thumbs:
            card.paste(img, (x + (260 - img.width) // 2, title_h))
            x += 260
        cards.append(card)
    if not cards:
        return
    cols = 1
    gap = 10
    width = max(card.width for card in cards)
    height = sum(card.height for card in cards) + gap * (len(cards) - 1)
    sheet = Image.new("RGB", (width, height), (230, 235, 240))
    y = 0
    for card in cards:
        sheet.paste(card, ((width - card.width) // 2, y))
        y += card.height + gap
    sheet.save(out_path)


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
