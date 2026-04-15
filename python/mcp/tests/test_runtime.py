from __future__ import annotations

import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from maa_diagnostic_mcp import (
    CoreCliError,
    CoreCliRuntime,
    CoreToolset,
    load_contract,
)
from maa_diagnostic_mcp.cli import main as cli_main


class CoreCliRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = CoreCliRuntime()

    def test_empty_result(self) -> None:
        result = self.runtime.empty_result("generic-maa-log")
        self.assertEqual(result["apiVersion"], "core/v1")
        self.assertEqual(result["profileId"], "generic-maa-log")

    def test_show_builtin_profile(self) -> None:
        profile = self.runtime.show_builtin_profile("generic-maa-log")
        self.assertEqual(profile["id"], "generic-maa-log")
        self.assertTrue(profile["recommendedTools"])

    def test_missing_profile_raises_structured_core_error(self) -> None:
        with self.assertRaises(CoreCliError) as context:
            self.runtime.show_builtin_profile("missing")

        self.assertEqual(context.exception.code, "profile_not_found")
        self.assertFalse(context.exception.retryable)

    def test_render_report_markdown(self) -> None:
        result = self.runtime.empty_result("generic-maa-log")
        rendered = self.runtime.render_report(result, format="markdown")
        self.assertIn("Summary", rendered)


class ToolingTests(unittest.TestCase):
    def test_contract_loader(self) -> None:
        contract = load_contract("core_error")
        self.assertEqual(
            contract["$id"],
            "https://maa-diagnostic-expert/contracts/error.schema.json",
        )

    def test_tool_specs_include_error_contract(self) -> None:
        toolset = CoreToolset(CoreCliRuntime())
        specs = toolset.list_tool_specs()
        self.assertGreaterEqual(len(specs), 5)
        self.assertTrue(all(spec.error_contract == "core_error" for spec in specs))


class CliTests(unittest.TestCase):
    def test_list_tools_json(self) -> None:
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = cli_main(["list-tools"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn('"name": "empty_result"', stdout.getvalue())

    def test_show_contract(self) -> None:
        stdout = StringIO()

        with redirect_stdout(stdout):
            exit_code = cli_main(["show-contract", "--name", "core_error"])

        self.assertEqual(exit_code, 0)
        self.assertIn('"$id": "https://maa-diagnostic-expert/contracts/error.schema.json"', stdout.getvalue())

    def test_invoke_empty_result(self) -> None:
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = cli_main(
                ["invoke", "--tool", "empty_result", "--profile-id", "generic-maa-log"]
            )

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn('"apiVersion": "core/v1"', stdout.getvalue())

    def test_invoke_missing_profile_returns_structured_error(self) -> None:
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = cli_main(
                ["invoke", "--tool", "show_builtin_profile", "--profile-id", "missing"]
            )

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn('"code": "profile_not_found"', stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
