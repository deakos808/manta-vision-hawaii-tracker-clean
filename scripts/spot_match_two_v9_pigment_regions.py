#!/usr/bin/env python3
"""Compatibility entrypoint for the v9 pigment-region matcher."""

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
MATCHING_DIR = SCRIPT_DIR / "matching"
sys.path.insert(0, str(MATCHING_DIR))

from pigment_region_matcher import main  # noqa: E402


if __name__ == "__main__":
    main()
