from __future__ import annotations

import asyncio
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from typing import Any, Awaitable, Callable

import anyio
import mcp.types as mcp_types
from mcp import ClientSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from maa_diagnostic_mcp import (
    CoreCliError,
    CoreCliRuntime,
    CoreToolset,
    McpServer,
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

    def test_tool_spec_converts_to_official_mcp_tool(self) -> None:
        toolset = CoreToolset(CoreCliRuntime())
        tool = toolset.list_tool_specs()[0].to_mcp_tool()
        self.assertIsInstance(tool, mcp_types.Tool)
        self.assertEqual(tool.annotations.readOnlyHint, True)


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


class McpServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.server = McpServer()

    async def _run_with_session(
        self,
        callback: Callable[[ClientSession], Awaitable[Any]],
    ) -> Any:
        client_to_server_send, client_to_server_recv = anyio.create_memory_object_stream(0)
        server_to_client_send, server_to_client_recv = anyio.create_memory_object_stream(0)
        result: Any = None

        async with anyio.create_task_group() as task_group:
            task_group.start_soon(
                self.server.server.run,
                client_to_server_recv,
                server_to_client_send,
                self.server.server.create_initialization_options(),
                True,
                False,
            )
            async with ClientSession(server_to_client_recv, client_to_server_send) as session:
                await session.initialize()
                result = await callback(session)
            task_group.cancel_scope.cancel()

        return result

    async def test_list_tools(self) -> None:
        result = await asyncio.wait_for(
            self._run_with_session(lambda session: session.list_tools()),
            timeout=10,
        )

        self.assertGreaterEqual(len(result.tools), 5)
        self.assertTrue(any(tool.name == "empty_result" for tool in result.tools))
        self.assertTrue(all(tool.inputSchema for tool in result.tools))

    async def test_tools_call_success(self) -> None:
        result = await asyncio.wait_for(
            self._run_with_session(
                lambda session: session.call_tool(
                    "empty_result",
                    {
                        "profile_id": "generic-maa-log",
                    },
                )
            ),
            timeout=10,
        )

        self.assertFalse(result.isError)
        self.assertEqual(result.structuredContent["profileId"], "generic-maa-log")

    async def test_tools_call_returns_tool_error(self) -> None:
        result = await asyncio.wait_for(
            self._run_with_session(
                lambda session: session.call_tool(
                    "show_builtin_profile",
                    {
                        "profile_id": "missing",
                    },
                )
            ),
            timeout=10,
        )

        self.assertTrue(result.isError)
        self.assertEqual(result.structuredContent["code"], "profile_not_found")


if __name__ == "__main__":
    unittest.main()
