from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from typing import Any, Awaitable, Callable
from unittest.mock import patch

import anyio
import mcp.types as mcp_types
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import maa_diagnostic_mcp.contracts as contracts_module
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
        self.assertIn("maafw-docs", profile["recommendedCorpora"])

    def test_list_builtin_profiles(self) -> None:
        catalog = self.runtime.list_builtin_profiles()
        self.assertEqual(catalog["apiVersion"], "profile-catalog/v1")
        self.assertGreaterEqual(len(catalog["profiles"]), 1)

    def test_list_builtin_corpora(self) -> None:
        catalog = self.runtime.list_builtin_corpora()
        self.assertEqual(catalog["apiVersion"], "corpus-catalog/v1")
        self.assertTrue(any(item["id"] == "maafw-docs" for item in catalog["corpora"]))
        self.assertTrue(any(item["id"] == "diagnostic-guides" for item in catalog["corpora"]))

    def test_search_local_corpus(self) -> None:
        result = self.runtime.search_local_corpus(
            {
                "apiVersion": "retrieval-query/v1",
                "query": "next on_error timeout",
                "corpusIds": ["maafw-docs"],
                "limit": 3,
            }
        )

        self.assertEqual(result["apiVersion"], "retrieval-result/v1")
        self.assertEqual(result["corpusIds"], ["maafw-docs"])
        self.assertGreaterEqual(result["stats"]["fileCount"], 1)
        self.assertGreaterEqual(len(result["hits"]), 1)
        self.assertTrue(result["hits"][0]["path"].startswith("sample/MaaFramework/docs/"))

    def test_prepare_builtin_corpora(self) -> None:
        result = self.runtime.prepare_builtin_corpora(
            {
                "apiVersion": "corpus-prepare/v1",
                "corpusIds": ["diagnostic-guides"],
                "force": True,
            }
        )

        self.assertEqual(result["apiVersion"], "corpus-prepare-result/v1")
        self.assertEqual(result["prepared"][0]["corpusId"], "diagnostic-guides")
        self.assertTrue(result["prepared"][0]["cachePath"].endswith("diagnostic-guides.json"))

    def test_run_filesystem_runtime(self) -> None:
        with tempfile.TemporaryDirectory(prefix="maa-diagnostic-mcp-fs-") as temp_dir:
            config_dir = Path(temp_dir) / "config"
            on_error_dir = Path(temp_dir) / "on_error"
            config_dir.mkdir(parents=True, exist_ok=True)
            on_error_dir.mkdir(parents=True, exist_ok=True)
            (config_dir / "maa_option.json").write_text(
                '{"save_on_error": true}',
                encoding="utf-8",
            )
            (on_error_dir / "scene.png").write_text("fake-image", encoding="utf-8")

            result = self.runtime.run_filesystem_runtime(
                {
                    "profileId": "generic-maa-log",
                    "roots": [temp_dir],
                    "includeGlobs": ["config/**/*", "on_error/**/*"],
                    "excludeGlobs": [],
                    "maxFiles": 20,
                    "parseConfigFiles": True,
                    "includeImages": True,
                }
            )

        self.assertEqual(result["apiVersion"], "core/v1")
        self.assertIn("filesystem", result["rawToolResults"])
        self.assertTrue(
            any(
                item["kind"] == "config_snapshot_available"
                for item in result["diagnosticMeta"]["findings"]
            )
        )

    def test_run_diagnostic_pipeline(self) -> None:
        result = self.runtime.run_diagnostic_pipeline(
            {
                "apiVersion": "diagnostic-pipeline/v1",
                "profileId": "generic-maa-log",
                "mla": {
                    "mode": "result",
                    "input": {
                        "profileId": "generic-maa-log",
                        "results": [
                            {
                                "tool": "get_task_overview",
                                "response": {
                                    "request_id": "req-1",
                                    "api_version": "v1",
                                    "ok": True,
                                    "data": {
                                        "task": {
                                            "task_id": 1,
                                            "entry": "DailyRewards",
                                            "status": "failed",
                                            "duration_ms": 100,
                                        },
                                        "summary": {
                                            "node_count": 2,
                                            "failed_node_count": 1,
                                            "reco_failed_count": 1,
                                        },
                                        "evidences": [],
                                    },
                                    "meta": {
                                        "duration_ms": 1,
                                        "warnings": [],
                                    },
                                    "error": None,
                                },
                            }
                        ],
                    },
                },
                "retrieval": {
                    "enabled": False,
                    "corpusIds": [],
                    "queryHints": [],
                    "limitPerQuery": 2,
                    "maxHits": 5,
                },
            }
        )

        self.assertEqual(result["apiVersion"], "core/v1")
        self.assertIn("diagnostic-pipeline", result["rawToolResults"])
        self.assertEqual(result["profileId"], "generic-maa-log")

    def test_describe_runtime(self) -> None:
        runtime_info = self.runtime.describe_runtime()
        self.assertEqual(runtime_info["apiVersion"], "runtime/v1")
        self.assertIn("describe-runtime", runtime_info["commands"])
        self.assertIn("prepare-builtin-corpora", runtime_info["commands"])
        self.assertIn("run-filesystem-runtime", runtime_info["commands"])
        self.assertIn("run-diagnostic-pipeline", runtime_info["commands"])
        self.assertIn("maafw-docs", runtime_info["builtinCorpusIds"])
        self.assertIn("diagnostic-guides", runtime_info["builtinCorpusIds"])

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

    def test_contract_loader_falls_back_to_bundled_contracts(self) -> None:
        source_contract_path = Path(__file__).resolve().parents[3] / "contracts" / "error.schema.json"

        with tempfile.TemporaryDirectory(prefix="maa-diagnostic-mcp-contracts-") as temp_dir:
            bundled_dir = Path(temp_dir)
            shutil.copy2(source_contract_path, bundled_dir / "error.schema.json")

            with patch.dict(os.environ, {"MAA_DIAGNOSTIC_REPO_ROOT": str(Path.cwd() / "missing-repo-root")}):
                with patch.object(contracts_module, "resolve_packaged_contracts_dir", return_value=bundled_dir):
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
        self.assertTrue(any(spec.name == "run_filesystem_runtime" for spec in specs))
        self.assertTrue(any(spec.name == "prepare_builtin_corpora" for spec in specs))
        self.assertTrue(any(spec.name == "run_diagnostic_pipeline" for spec in specs))

    def test_tool_spec_converts_to_official_mcp_tool(self) -> None:
        toolset = CoreToolset(CoreCliRuntime())
        tool = toolset.list_tool_specs()[0].to_mcp_tool()
        self.assertIsInstance(tool, mcp_types.Tool)
        self.assertEqual(tool.annotations.readOnlyHint, True)

    def test_runtime_requires_explicit_core_path_outside_repo(self) -> None:
        with patch("maa_diagnostic_mcp.runtime.find_repo_root", return_value=None):
            runtime = CoreCliRuntime()

        with self.assertRaises(RuntimeError) as context:
            runtime._base_command()

        self.assertIn("MAA_DIAGNOSTIC_CORE_CLI_JS", str(context.exception))


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

    def test_invoke_describe_runtime(self) -> None:
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = cli_main(["invoke", "--tool", "describe_runtime"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn('"apiVersion": "runtime/v1"', stdout.getvalue())

    def test_invoke_list_builtin_corpora(self) -> None:
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = cli_main(["invoke", "--tool", "list_builtin_corpora"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn('"apiVersion": "corpus-catalog/v1"', stdout.getvalue())

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
        self.package_root = Path(__file__).resolve().parents[1]
        self.src_dir = self.package_root / "src"

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
        self.assertTrue(any(tool.name == "run_filesystem_runtime" for tool in result.tools))
        self.assertTrue(any(tool.name == "search_local_corpus" for tool in result.tools))
        self.assertTrue(any(tool.name == "prepare_builtin_corpora" for tool in result.tools))
        self.assertTrue(any(tool.name == "run_diagnostic_pipeline" for tool in result.tools))
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

    async def test_tools_call_search_local_corpus(self) -> None:
        result = await asyncio.wait_for(
            self._run_with_session(
                lambda session: session.call_tool(
                    "search_local_corpus",
                    {
                        "apiVersion": "retrieval-query/v1",
                        "query": "ProjectInterfaceV2",
                        "corpusIds": ["maafw-docs"],
                        "limit": 3,
                    },
                )
            ),
            timeout=10,
        )

        self.assertFalse(result.isError)
        self.assertEqual(result.structuredContent["apiVersion"], "retrieval-result/v1")
        self.assertEqual(result.structuredContent["corpusIds"], ["maafw-docs"])
        self.assertGreaterEqual(len(result.structuredContent["hits"]), 1)

    async def test_tools_call_run_filesystem_runtime(self) -> None:
        with tempfile.TemporaryDirectory(prefix="maa-diagnostic-mcp-fs-") as temp_dir:
            config_dir = Path(temp_dir) / "config"
            config_dir.mkdir(parents=True, exist_ok=True)
            (config_dir / "maa_option.json").write_text(
                '{"save_on_error": true}',
                encoding="utf-8",
            )

            result = await asyncio.wait_for(
                self._run_with_session(
                    lambda session: session.call_tool(
                        "run_filesystem_runtime",
                        {
                            "input": {
                                "roots": [temp_dir],
                                "includeGlobs": ["config/**/*"],
                                "excludeGlobs": [],
                                "maxFiles": 20,
                                "parseConfigFiles": True,
                                "includeImages": False,
                            }
                        },
                    )
                ),
                timeout=10,
            )

        self.assertFalse(result.isError)
        self.assertIn("filesystem", result.structuredContent["rawToolResults"])

    async def test_tools_call_run_diagnostic_pipeline(self) -> None:
        result = await asyncio.wait_for(
            self._run_with_session(
                lambda session: session.call_tool(
                    "run_diagnostic_pipeline",
                    {
                        "input": {
                            "apiVersion": "diagnostic-pipeline/v1",
                            "profileId": "generic-maa-log",
                            "mla": {
                                "mode": "result",
                                "input": {
                                    "profileId": "generic-maa-log",
                                    "results": [
                                        {
                                            "tool": "get_task_overview",
                                            "response": {
                                                "request_id": "req-1",
                                                "api_version": "v1",
                                                "ok": True,
                                                "data": {
                                                    "task": {
                                                        "task_id": 1,
                                                        "entry": "DailyRewards",
                                                        "status": "failed",
                                                        "duration_ms": 100,
                                                    },
                                                    "summary": {
                                                        "node_count": 2,
                                                        "failed_node_count": 1,
                                                        "reco_failed_count": 1,
                                                    },
                                                    "evidences": [],
                                                },
                                                "meta": {
                                                    "duration_ms": 1,
                                                    "warnings": [],
                                                },
                                                "error": None,
                                            },
                                        }
                                    ],
                                },
                            },
                            "retrieval": {
                                "enabled": False,
                                "corpusIds": [],
                                "queryHints": [],
                                "limitPerQuery": 2,
                                "maxHits": 5,
                            },
                        }
                    },
                )
            ),
            timeout=10,
        )

        self.assertFalse(result.isError)
        self.assertEqual(result.structuredContent["profileId"], "generic-maa-log")
        self.assertIn("diagnostic-pipeline", result.structuredContent["rawToolResults"])

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

    @unittest.skip("Pending investigation: official stdio subprocess interoperability is environment-sensitive.")
    async def test_stdio_subprocess_smoke(self) -> None:
        server_params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "maa_diagnostic_mcp", "serve-stdio"],
            env={
                **os.environ,
                "PYTHONPATH": str(self.src_dir),
            },
            cwd=str(self.package_root),
        )

        async def _run() -> tuple[int, str]:
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    result = await session.call_tool(
                        "empty_result",
                        {
                            "profile_id": "generic-maa-log",
                        },
                    )
                    return len(tools.tools), result.structuredContent["profileId"]

        tool_count, profile_id = await asyncio.wait_for(_run(), timeout=10)
        self.assertGreaterEqual(tool_count, 5)
        self.assertEqual(profile_id, "generic-maa-log")


if __name__ == "__main__":
    unittest.main()
