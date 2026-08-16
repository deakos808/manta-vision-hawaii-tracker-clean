#!/usr/bin/env python3
"""Reject repository files containing database credentials without echoing values."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAX_FILE_BYTES = 25 * 1024 * 1024
TEMP_PATH = re.compile(r"(?:^|/)supabase/\.temp(?:/|$)")
CONTENT_PATTERNS: tuple[tuple[re.Pattern[bytes], str], ...] = (
    (
        re.compile(rb"postgres(?:ql)?://[^\s/'\"<>:@]+:[^\s/'\"<>@]+@", re.IGNORECASE),
        "database URL with embedded credentials",
    ),
    (
        re.compile(rb"(?:^|[\s;])PGPASSWORD\s*=\s*[^\s;]+", re.IGNORECASE | re.MULTILINE),
        "PostgreSQL password assignment",
    ),
    (
        re.compile(rb"(?:^|[\s;])password\s*=\s*[^\s;]+", re.IGNORECASE | re.MULTILINE),
        "database DSN password assignment",
    ),
)


def git(*args: str, input_bytes: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def decode_paths(raw: bytes) -> list[str]:
    return [os.fsdecode(item) for item in raw.split(b"\0") if item]


def index_paths(staged: bool, include_untracked: bool) -> list[str]:
    if staged:
        result = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    elif include_untracked:
        result = git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    else:
        result = git("ls-files", "--cached", "-z")
    if result.returncode:
        raise RuntimeError("unable to enumerate repository paths")
    return decode_paths(result.stdout)


def index_bytes(path: str) -> bytes | None:
    result = git("show", f":{path}")
    return result.stdout if result.returncode == 0 else None


def worktree_bytes(path: str) -> bytes | None:
    candidate = ROOT / path
    try:
        if not candidate.is_file() or candidate.is_symlink() or candidate.stat().st_size > MAX_FILE_BYTES:
            return None
        return candidate.read_bytes()
    except OSError:
        return None


def scan_bytes(path: str, content: bytes, findings: set[tuple[str, str]]) -> None:
    for pattern, classification in CONTENT_PATTERNS:
        if pattern.search(content):
            findings.add((path, classification))


def scan_repository(staged: bool, include_untracked: bool) -> list[tuple[str, str]]:
    findings: set[tuple[str, str]] = set()
    for path in index_paths(staged, include_untracked):
        normalized = path.replace("\\", "/")
        if TEMP_PATH.search(normalized):
            findings.add((path, "Supabase temporary-state file"))
            continue
        content = index_bytes(path) if staged else worktree_bytes(path)
        if content is not None:
            scan_bytes(path, content, findings)
    return sorted(findings)


def scan_explicit_paths(paths: list[str]) -> list[tuple[str, str]]:
    findings: set[tuple[str, str]] = set()
    for supplied in paths:
        candidate = Path(supplied)
        if not candidate.is_absolute():
            candidate = ROOT / candidate
        candidates = [candidate] if candidate.is_file() else candidate.rglob("*") if candidate.is_dir() else []
        for path in candidates:
            if not path.is_file() or path.is_symlink():
                continue
            try:
                relative = path.relative_to(ROOT).as_posix()
            except ValueError:
                relative = str(path)
            if TEMP_PATH.search(relative):
                findings.add((relative, "Supabase temporary-state file"))
                continue
            content = worktree_bytes(relative) if not path.is_absolute() or path.is_relative_to(ROOT) else None
            if content is None:
                try:
                    if path.stat().st_size <= MAX_FILE_BYTES:
                        content = path.read_bytes()
                except OSError:
                    content = None
            if content is not None:
                scan_bytes(relative, content, findings)
    return sorted(findings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="scan added or modified index entries")
    parser.add_argument(
        "--include-untracked",
        action="store_true",
        help="include unignored untracked files in a working-tree inventory",
    )
    parser.add_argument("--paths", nargs="+", help="scan explicit files or directories")
    args = parser.parse_args()

    try:
        findings = (
            scan_explicit_paths(args.paths)
            if args.paths
            else scan_repository(args.staged, args.include_untracked)
        )
    except RuntimeError as error:
        print(f"CREDENTIAL_GUARD: repository scan unavailable [{error}]", file=sys.stderr)
        return 2

    if findings:
        for path, classification in findings:
            print(f"CREDENTIAL_GUARD: {path} [{classification}]", file=sys.stderr)
        return 1

    scope = "staged files" if args.staged else "repository files"
    if args.paths:
        scope = "explicit paths"
    print(f"Repository credential guard passed ({scope}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
