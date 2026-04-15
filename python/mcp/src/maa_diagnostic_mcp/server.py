from __future__ import annotations

import json
from typing import Any

import anyio
import mcp.types as mcp_types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.stdio import stdio_server

from .errors import CoreCliError
from .tools import CoreToolset


class McpServer:
    def __init__(
        self,
        toolset: CoreToolset | None = None,
        *,
        server_name: str = "maa-diagnostic-expert-mcp",
        server_version: str = "0.1.0",
        instructions: str = "Use these tools to run deterministic Maa diagnostics through the local core runtime.",
    ) -> None:
        self.toolset = toolset or CoreToolset()
        self.server_name = server_name
        self.server_version = server_version
        self.instructions = instructions
        self.server = Server(
            name=self.server_name,
            version=self.server_version,
            instructions=self.instructions,
        )
        self._register_handlers()

    def _register_handlers(self) -> None:
        @self.server.list_tools()
        async def _list_tools() -> list[mcp_types.Tool]:
            return self.list_tools()

        @self.server.call_tool()
        async def _call_tool(
            name: str,
            arguments: dict[str, Any],
        ) -> (
            mcp_types.CallToolResult
            | dict[str, Any]
            | tuple[list[mcp_types.TextContent], dict[str, Any]]
            | list[mcp_types.TextContent]
        ):
            return self.call_tool(name, arguments)

    def list_tools(self) -> list[mcp_types.Tool]:
        return [spec.to_mcp_tool() for spec in self.toolset.list_tool_specs()]

    def _tool_result_to_mcp(
        self,
        result: str | dict[str, Any],
    ) -> (
        dict[str, Any]
        | tuple[list[mcp_types.TextContent], dict[str, Any]]
        | list[mcp_types.TextContent]
    ):
        if isinstance(result, str):
            return [
                mcp_types.TextContent(
                    type="text",
                    text=result,
                )
            ]

        return (
            [
                mcp_types.TextContent(
                    type="text",
                    text=json.dumps(result, ensure_ascii=False, indent=2),
                )
            ],
            result,
        )

    def _tool_error_to_mcp(self, error: Exception) -> mcp_types.CallToolResult:
        if isinstance(error, CoreCliError) and error.core_error:
            text = json.dumps(error.core_error, ensure_ascii=False, indent=2)
            return mcp_types.CallToolResult(
                content=[mcp_types.TextContent(type="text", text=text)],
                structuredContent=error.core_error,
                isError=True,
            )

        return mcp_types.CallToolResult(
            content=[mcp_types.TextContent(type="text", text=str(error))],
            structuredContent={
                "message": str(error),
            },
            isError=True,
        )

    def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> (
        mcp_types.CallToolResult
        | dict[str, Any]
        | tuple[list[mcp_types.TextContent], dict[str, Any]]
        | list[mcp_types.TextContent]
    ):
        arguments = arguments or {}
        try:
            if name == "empty_result":
                result = self.toolset.empty_result(arguments.get("profile_id"))
            elif name == "validate_core_result":
                result = self.toolset.validate_core_result(arguments.get("result"))
            elif name == "render_report":
                result = self.toolset.render_report(
                    arguments.get("result"),
                    format=arguments.get("format", "markdown"),
                )
            elif name == "normalize_mla_result":
                result = self.toolset.normalize_mla_result(
                    arguments.get("input"),
                    with_report=bool(arguments.get("with_report", False)),
                )
            elif name == "run_mla_runtime":
                result = self.toolset.run_mla_runtime(
                    arguments.get("input"),
                    with_report=bool(arguments.get("with_report", False)),
                )
            elif name == "show_builtin_profile":
                result = self.toolset.show_builtin_profile(arguments.get("profile_id"))
            else:
                return self._tool_error_to_mcp(KeyError(f"Unknown tool: {name}"))
        except (CoreCliError, KeyError, ValueError, TypeError) as error:
            return self._tool_error_to_mcp(error)

        return self._tool_result_to_mcp(result)

    async def run_stdio(self, stdin: Any = None, stdout: Any = None) -> None:
        initialization_options = self.server.create_initialization_options(
            notification_options=NotificationOptions(
                tools_changed=False,
            )
        )
        async with stdio_server(stdin=stdin, stdout=stdout) as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                initialization_options=initialization_options,
            )

    def serve_stdio(self, stdin: Any = None, stdout: Any = None) -> int:
        anyio.run(self.run_stdio, stdin, stdout)
        return 0


def main() -> int:
    server = McpServer()
    return server.serve_stdio()


if __name__ == "__main__":
    raise SystemExit(main())
