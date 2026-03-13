from __future__ import annotations

import argparse
import difflib
import re
from pathlib import Path

import pandas as pd


def normalize_name(value: object) -> str:
    if pd.isna(value):
        return ""
    s = str(value).strip().upper()
    s = re.sub(r"^\s*MP[\s_\-:]+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def read_table(path: Path, header=None, sheet_name=0) -> pd.DataFrame:
    suffix = path.suffix.lower()

    if suffix == ".csv":
        return pd.read_csv(path, header=header)

    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, header=header, sheet_name=sheet_name)

    raise ValueError(f"Unsupported file type: {path}")


def read_mprf(path: Path) -> pd.DataFrame:
    raw = read_table(path, header=None)

    if len(raw) < 3:
        raise ValueError("MPRF file is too short to parse")

    headers = raw.iloc[1].tolist()
    df = raw.iloc[2:].copy()
    df.columns = headers
    df = df.dropna(how="all").reset_index(drop=True)

    if "Name" not in df.columns:
        raise ValueError("Could not find 'Name' column in MPRF file")

    df["mprf_name_raw"] = df["Name"]
    df["normalized_name"] = df["Name"].apply(normalize_name)
    df = df[df["normalized_name"] != ""].copy()

    return df


def read_hamer(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in {".xlsx", ".xls"}:
        sheets = pd.read_excel(path, sheet_name=None)
        if not sheets:
            raise ValueError("HAMER workbook has no sheets")
        first_sheet_name = list(sheets.keys())[0]
        df = sheets[first_sheet_name].copy()
    else:
        raise ValueError(f"Unsupported HAMER file type: {path}")

    # Normalize column names to lower snake-ish style for matching
    original_cols = list(df.columns)
    normalized_map = {}
    for c in original_cols:
        key = str(c).strip().lower()
        normalized_map[c] = key
    df = df.rename(columns=normalized_map)

    required = ["catalog_id", "name", "species"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(
            f"HAMER file is missing required columns: {missing}. "
            f"Found columns: {list(df.columns)}"
        )

    df["hamer_name_raw"] = df["name"]
    df["normalized_name"] = df["name"].apply(normalize_name)
    df = df[df["normalized_name"] != ""].copy()

    return df


def safe_col(df: pd.DataFrame, col: str):
    return df[col] if col in df.columns else ""


def build_possible_matches(unmatched: pd.DataFrame, mprf_unique: pd.DataFrame, limit: int = 3) -> pd.DataFrame:
    mprf_names = sorted(mprf_unique["normalized_name"].dropna().unique().tolist())
    rows: list[dict] = []

    for _, r in unmatched.iterrows():
        norm = r["normalized_name"]
        guesses = difflib.get_close_matches(norm, mprf_names, n=limit, cutoff=0.75)

        if guesses:
            for guess in guesses:
                m = mprf_unique[mprf_unique["normalized_name"] == guess].iloc[0]
                rows.append(
                    {
                        "catalog_id": r.get("catalog_id"),
                        "hamer_name": r.get("hamer_name_raw"),
                        "hamer_normalized_name": norm,
                        "suggested_mprf_name": m.get("mprf_name_raw"),
                        "suggested_mprf_normalized_name": guess,
                        "suggested_mprf_date": m.get("Date"),
                        "suggested_mprf_location": m.get("Location"),
                        "suggested_mprf_id_1": m.get("ID#"),
                        "suggested_mprf_id_2": m.get("ID number?"),
                    }
                )

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile HAMER and MPRF birostris catalogs by normalized name")
    parser.add_argument("--mprf", required=True, help="Path to MPRF CSV/XLSX")
    parser.add_argument("--hamer", required=True, help="Path to HAMER CSV/XLSX")
    parser.add_argument("--outdir", required=True, help="Output directory")
    args = parser.parse_args()

    mprf_path = Path(args.mprf).expanduser().resolve()
    hamer_path = Path(args.hamer).expanduser().resolve()
    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    if not mprf_path.exists():
        raise FileNotFoundError(f"MPRF file not found: {mprf_path}")

    if not hamer_path.exists():
        raise FileNotFoundError(f"HAMER file not found: {hamer_path}")

    mprf = read_mprf(mprf_path)
    hamer = read_hamer(hamer_path)

    mprf_unique = (
        mprf.sort_values(["normalized_name"], na_position="last")
        .drop_duplicates(subset=["normalized_name"], keep="first")
        .copy()
    )

    mprf_name_set = set(mprf_unique["normalized_name"].tolist())

    matched = hamer[hamer["normalized_name"].isin(mprf_name_set)].copy()
    unmatched = hamer[~hamer["normalized_name"].isin(mprf_name_set)].copy()

    exact_matches = matched.merge(
        mprf_unique[
            [
                "mprf_name_raw",
                "normalized_name",
                *(["Date"] if "Date" in mprf_unique.columns else []),
                *(["Location"] if "Location" in mprf_unique.columns else []),
                *(["ID#"] if "ID#" in mprf_unique.columns else []),
                *(["ID number?"] if "ID number?" in mprf_unique.columns else []),
            ]
        ],
        on="normalized_name",
        how="left",
    ).rename(
        columns={
            "Date": "mprf_example_date",
            "Location": "mprf_example_location",
            "ID#": "mprf_id_1",
            "ID number?": "mprf_id_2",
        }
    )

    preferred_cols = [
        "catalog_id",
        "hamer_name_raw",
        "normalized_name",
        "species",
        "gender",
        "age_class",
        "first_sighting",
        "last_sighting",
        "last_size_m",
        "total_sightings",
        "total_sizes",
        "total_biopsies",
        "mprf",
        "populations",
        "islands",
        "sitelocation",
        "image_link",
        "best_catalog_ventral_thumb_url",
        "best_catalog_ventral_path",
        "best_catalog_photo_url",
    ]

    present_cols = [c for c in preferred_cols if c in unmatched.columns]

    unmatched_out = unmatched[present_cols].rename(
        columns={
            "hamer_name_raw": "hamer_name",
        }
    )

    possible_matches = build_possible_matches(unmatched, mprf_unique)

    summary = pd.DataFrame(
        [
            {"metric": "hamer_rows", "value": len(hamer)},
            {"metric": "hamer_unique_normalized_names", "value": hamer["normalized_name"].nunique()},
            {"metric": "mprf_rows", "value": len(mprf)},
            {"metric": "mprf_unique_normalized_names", "value": mprf_unique["normalized_name"].nunique()},
            {"metric": "exact_name_matches", "value": len(matched)},
            {"metric": "hamer_not_in_mprf_by_name", "value": len(unmatched)},
            {"metric": "mprf_source_file", "value": str(mprf_path)},
            {"metric": "hamer_source_file", "value": str(hamer_path)},
        ]
    )

    summary_path = outdir / "birostris_reconciliation_summary.csv"
    matches_path = outdir / "birostris_exact_name_matches.csv"
    unmatched_path = outdir / "birostris_hamer_not_in_mprf_by_name.csv"
    possible_path = outdir / "birostris_possible_close_matches.csv"
    xlsx_path = outdir / "birostris_reconciliation_workbook.xlsx"

    summary.to_csv(summary_path, index=False)
    exact_matches.to_csv(matches_path, index=False)
    unmatched_out.to_csv(unmatched_path, index=False)
    possible_matches.to_csv(possible_path, index=False)

    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        summary.to_excel(writer, sheet_name="summary", index=False)
        exact_matches.to_excel(writer, sheet_name="exact_name_matches", index=False)
        unmatched_out.to_excel(writer, sheet_name="hamer_not_in_mprf", index=False)
        possible_matches.to_excel(writer, sheet_name="possible_close_matches", index=False)

    print(f"Wrote: {summary_path}")
    print(f"Wrote: {matches_path}")
    print(f"Wrote: {unmatched_path}")
    print(f"Wrote: {possible_path}")
    print(f"Wrote: {xlsx_path}")
    print()
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
