#!/usr/bin/env python3
"""Deterministic fabricated-fixture tests for the repository credential guard."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


GUARD = Path(__file__).with_name("check_repository_credentials.py")


class RepositoryCredentialGuardTests(unittest.TestCase):
    def run_guard(self, path: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(GUARD), "--paths", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_clean_fixture_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "config.txt"
            fixture.write_text("database host configured by secret manager\n", encoding="utf-8")
            result = self.run_guard(fixture)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_fabricated_embedded_database_url_fails_without_value_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "renamed-config.txt"
            marker = "FABRICATED_PASSWORD_DO_NOT_REPORT"
            fixture.write_text(
                "postgres" + "ql://fabricated-user:" + marker + "@db.invalid:5432/fabricated\n",
                encoding="utf-8",
            )
            result = self.run_guard(fixture)
            self.assertEqual(result.returncode, 1)
            self.assertIn("renamed-config.txt", result.stderr)
            self.assertIn("database URL with embedded credentials", result.stderr)
            self.assertNotIn(marker, result.stderr)

    def test_fabricated_password_assignment_fails_without_value_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "connection.properties"
            marker = "FABRICATED_DSN_PASSWORD_DO_NOT_REPORT"
            fixture.write_text("host=db.invalid password" + "=" + marker + " user=test\n", encoding="utf-8")
            result = self.run_guard(fixture)
            self.assertEqual(result.returncode, 1)
            self.assertIn("connection.properties", result.stderr)
            self.assertIn("database DSN password assignment", result.stderr)
            self.assertNotIn(marker, result.stderr)

    def test_supabase_temporary_state_path_fails_without_reading_content(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "supabase/.temp/project-ref"
            fixture.parent.mkdir(parents=True)
            fixture.write_text("FABRICATED_VALUE_DO_NOT_REPORT", encoding="utf-8")
            result = self.run_guard(fixture)
            self.assertEqual(result.returncode, 1)
            self.assertIn("Supabase temporary-state file", result.stderr)
            self.assertNotIn("FABRICATED_VALUE_DO_NOT_REPORT", result.stderr)


if __name__ == "__main__":
    unittest.main()
