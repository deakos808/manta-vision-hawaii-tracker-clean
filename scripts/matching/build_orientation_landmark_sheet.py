#!/usr/bin/env python3
"""Build a contact sheet for matcher orientation landmark overlays."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


CARD_W = 390
CARD_H = 330
GAP = 18
MARGIN = 24
HEADER_H = 78


def main() -> None:
    parser = argparse.ArgumentParser(description="Build orientation landmark contact sheet from case-pack directories.")
    parser.add_argument("--case-dir", action="append", required=True, help="Case-pack directory to include.")
    parser.add_argument("--variant", default="normal", choices=("normal", "enhanced"))
    parser.add_argument("--out", required=True, help="Output PNG path.")
    args = parser.parse_args()

    case_dirs = [Path(p) for p in args.case_dir]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet = build_sheet(case_dirs, args.variant)
    sheet.save(out)
    print(str(out), flush=True)


def build_sheet(case_dirs: list[Path], variant: str) -> Image.Image:
    cols = 3
    rows = len(case_dirs)
    width = MARGIN * 2 + cols * CARD_W + (cols - 1) * GAP
    height = HEADER_H + rows * (CARD_H + 52) + MARGIN
    sheet = Image.new("RGB", (width, height), (242, 246, 249))
    draw = ImageDraw.Draw(sheet)
    draw.text((MARGIN, 22), f"Orientation Landmark Review ({variant})", fill=(20, 30, 40))
    draw.text(
        (MARGIN, 48),
        "Red=head/front line, green=head-to-tail cue, blue=body axis, purple=lateral axis, yellow=ROI.",
        fill=(62, 78, 94),
    )
    labels = ["Query", "Expected Same Catalog", "Top Wrong Candidate"]
    y = HEADER_H
    for case_dir in case_dirs:
        case_label = case_dir.name
        draw.text((MARGIN, y + 8), case_label, fill=(20, 30, 40))
        y += 30
        paths = [
            case_dir / f"{variant}_expected/query/query_11_orientation_landmarks.png",
            case_dir / f"{variant}_expected/candidate/candidate_11_orientation_landmarks.png",
            case_dir / f"{variant}_top_wrong/candidate/candidate_11_orientation_landmarks.png",
        ]
        for idx, path in enumerate(paths):
            x = MARGIN + idx * (CARD_W + GAP)
            card = Image.new("RGB", (CARD_W, CARD_H), (255, 255, 255))
            cd = ImageDraw.Draw(card)
            cd.text((10, 8), labels[idx], fill=(40, 52, 64))
            panel = load_panel(path, CARD_W - 20, CARD_H - 42)
            card.paste(panel, (10, 32))
            cd.rectangle((0, 0, CARD_W - 1, CARD_H - 1), outline=(190, 202, 214))
            sheet.paste(card, (x, y))
        y += CARD_H + 22
    return sheet


def load_panel(path: Path, max_w: int, max_h: int) -> Image.Image:
    if not path.exists():
        panel = Image.new("RGB", (max_w, max_h), (235, 238, 242))
        draw = ImageDraw.Draw(panel)
        draw.text((12, 12), f"Missing:\n{path.name}", fill=(90, 100, 110))
        return panel
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (max_w, max_h), (248, 250, 252))
    panel.paste(img, ((max_w - img.width) // 2, (max_h - img.height) // 2))
    return panel


if __name__ == "__main__":
    main()
