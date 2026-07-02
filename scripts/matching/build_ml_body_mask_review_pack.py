#!/usr/bin/env python3
"""Build a review pack for local ML body/background segmentation.

This script does not change matcher scores. It tests whether a local rembg
subject mask is good enough to replace the hand-built body mask stage.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from rembg import new_session, remove

from build_pigment_review_pack import HIGH_EXAMPLES, LOW_EXAMPLES
from pigment_region_matcher import ensure_dir, load_rgb, morph, overlay_mask


def main() -> None:
    parser = argparse.ArgumentParser(description="Review local rembg body masks on high/low matcher examples.")
    parser.add_argument("--out-dir", default="scripts/matching/output/ml_body_mask_review_pack_12")
    parser.add_argument("--long-edge", type=int, default=900)
    parser.add_argument("--model", default="u2net", help="rembg model name, e.g. u2net, u2netp, isnet-general-use")
    parser.add_argument("--erode", type=int, default=0, help="Optional erosion radius for interior mask preview.")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    ensure_dir(out_dir)
    session = new_session(args.model)
    rows: list[dict[str, Any]] = []
    cards: list[Image.Image] = []
    for group, label, image_path in HIGH_EXAMPLES + LOW_EXAMPLES:
        path = Path(image_path)
        case_dir = out_dir / group / label
        ensure_dir(case_dir)
        if not path.exists():
            rows.append({"group": group, "label": label, "image_path": image_path, "status": "missing"})
            continue
        rgb = load_rgb(path, args.long_edge)
        mask = rembg_mask(rgb, session)
        if args.erode > 0:
            preview_mask = morph(mask, args.erode, "erode")
        else:
            preview_mask = mask
        original = Image.fromarray(rgb)
        mask_img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L").convert("RGB")
        cutout = Image.fromarray(np.where(preview_mask[:, :, None], rgb, 0).astype(np.uint8))
        overlay = overlay_mask(rgb, preview_mask, (0, 220, 255), 0.34)
        card = make_card(group, label, original, overlay, cutout, mask_img)
        card_path = case_dir / "ml_mask_review_card.png"
        original.save(case_dir / "original.png")
        mask_img.save(case_dir / "ml_mask.png")
        overlay.save(case_dir / "ml_mask_overlay.png")
        cutout.save(case_dir / "ml_body_cutout.png")
        card.save(card_path)
        cards.append(card)
        rows.append(
            {
                "group": group,
                "label": label,
                "image_path": image_path,
                "status": "ok",
                "mask_area_fraction": float(mask.mean()),
                "card_path": str(card_path),
            }
        )
    write_manifest(out_dir / "manifest.csv", rows)
    (out_dir / "manifest.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    make_sheet(cards, out_dir / "ml_body_mask_contact_sheet.png")
    print(json.dumps({"out_dir": str(out_dir), "image_count": len(cards), "sheet": str(out_dir / "ml_body_mask_contact_sheet.png")}, indent=2), flush=True)


def rembg_mask(rgb: np.ndarray, session: Any) -> np.ndarray:
    img = Image.fromarray(rgb).convert("RGB")
    out = remove(img, session=session, only_mask=True)
    mask = np.asarray(out.convert("L")) > 24
    # Smooth the subject mask lightly for body-mask use.
    mask = morph(mask, 2, "dilate")
    mask = morph(mask, 2, "erode")
    return mask.astype(bool)


def make_card(group: str, label: str, original: Image.Image, overlay: Image.Image, cutout: Image.Image, mask: Image.Image) -> Image.Image:
    imgs = [original.copy(), overlay.copy(), cutout.copy(), mask.copy()]
    for img in imgs:
        img.thumbnail((280, 230), Image.Resampling.LANCZOS)
    title_h = 56
    w = 280 * len(imgs)
    h = title_h + max(img.height for img in imgs)
    card = Image.new("RGB", (w, h), (246, 249, 251))
    d = ImageDraw.Draw(card)
    d.text((8, 8), f"{group.upper()} {label}", fill=(20, 30, 40))
    d.text((8, 30), "original | ML overlay | ML cutout | ML mask", fill=(60, 75, 90))
    x = 0
    for img in imgs:
        card.paste(img, (x + (280 - img.width) // 2, title_h))
        x += 280
    return card


def make_sheet(cards: list[Image.Image], out_path: Path) -> None:
    if not cards:
        return
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
