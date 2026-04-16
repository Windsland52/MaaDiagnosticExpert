from __future__ import annotations

import asyncio
import json
import sys
import threading
from contextlib import AsyncExitStack
from contextlib import asynccontextmanager
from typing import Any

import anyio
import mcp.types as mcp_types
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.session import ServerSession
from mcp.shared.message import SessionMessage
from mcp.shared.session import RequestResponder

from .errors import CoreCliError
from .tools import CoreToolset


@asynccontextmanager
async def stdio_transport(
    stdin: Any = None,
    stdout: Any = None,
):
    stdin = stdin or sys.stdin.buffer
    stdout = stdout or sys.stdout.buffer

    read_stream_writer, read_stream = anyio.create_memory_object_stream[SessionMessage | Exception](0)
    write_stream, write_stream_reader = anyio.create_memory_object_stream[SessionMessage](0)
    loop = asyncio.get_running_loop()
    reader_finished = threading.Event()

    def stdin_reader_thread() -> None:
        try:
            while True:
                raw_line = stdin.readline()
                if not raw_line:
                    break

                try:
                    message = mcp_types.JSONRPCMessage.model_validate_json(raw_line)
                    # In this environment, forwarding the post-initialize
                    # client notification into ServerSession can block the
                    # subprocess stdio path. The session already transitions
                    # state when handling InitializeRequest, and our tools do
                    # not depend on this notification payload.
                    if getattr(message.root, "method", None) == "notifications/initialized":
                        continue
                    future = asyncio.run_coroutine_threadsafe(
                        read_stream_writer.send(SessionMessage(message)),
                        loop,
                    )
                except Exception as exc:
                    future = asyncio.run_coroutine_threadsafe(
                        read_stream_writer.send(exc),
                        loop,
                    )

                future.result()
        finally:
            reader_finished.set()
            try:
                asyncio.run_coroutine_threadsafe(read_stream_writer.aclose(), loop).result()
            except RuntimeError:  # pragma: no cover
                pass

    async def stdout_writer() -> None:
        try:
            async with write_stream_reader:
                async for session_message in write_stream_reader:
                    payload = (
                        session_message.message.model_dump_json(
                            by_alias=True,
                            exclude_none=True,
                        )
                        + "\n"
                    ).encode("utf-8")
                    stdout.write(payload)
                    stdout.flush()
        except anyio.ClosedResourceError:  # pragma: no cover
            await anyio.lowlevel.checkpoint()

    reader_thread = threading.Thread(
        target=stdin_reader_thread,
        name="maa-diagnostic-mcp-stdin-reader",
        daemon=True,
    )
    reader_thread.start()

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(stdout_writer)
        try:
            yield read_stream, write_stream
        finally:
            await write_stream.aclose()
            task_group.cancel_scope.cancel()

    if reader_finished.is_set():
        reader_thread.join(timeout=0.1)


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
            payload: dict[str, Any] | None = None

            if name == "validate_core_result":
                payload = arguments.get("result")
            elif name == "render_report":
                payload = arguments.get("result")
            elif name in {
                "normalize_filesystem_result",
                "run_filesystem_runtime",
                "normalize_mla_result",
                "run_mla_runtime",
                "normalize_mse_result",
                "run_mse_runtime",
                "run_diagnostic_pipeline",
            }:
                payload = arguments.get("input")
            elif name in {"prepare_builtin_corpora", "search_local_corpus"}:
                payload = arguments

            result = self.toolset.invoke(
                name,
                payload=payload,
                profile_id=arguments.get("profile_id"),
                format=arguments.get("format", "markdown"),
                with_report=bool(arguments.get("with_report", False)),
            )
        except (CoreCliError, KeyError, ValueError, TypeError) as error:
            return self._tool_error_to_mcp(error)

        return self._tool_result_to_mcp(result)

    async def run_stdio(self, stdin: Any = None, stdout: Any = None) -> None:
        initialization_options = self.server.create_initialization_options(
            notification_options=NotificationOptions(
                tools_changed=False,
            )
        )
        async with stdio_transport(stdin=stdin, stdout=stdout) as (read_stream, write_stream):
            await self._run_official_server(
                read_stream,
                write_stream,
                initialization_options=initialization_options,
            )

    async def _run_official_server(
        self,
        read_stream: Any,
        write_stream: Any,
        *,
        initialization_options: Any,
    ) -> None:
        async with AsyncExitStack() as stack:
            lifespan_context = await stack.enter_async_context(self.server.lifespan(self.server))
            session = await stack.enter_async_context(
                _PatchedServerSession(
                    read_stream,
                    write_stream,
                    initialization_options,
                )
            )

            async with anyio.create_task_group() as task_group:
                try:
                    async for message in session.incoming_messages:
                        task_group.start_soon(
                            self.server._handle_message,
                            message,
                            session,
                            lifespan_context,
                            False,
                        )
                finally:
                    task_group.cancel_scope.cancel()

    def serve_stdio(self, stdin: Any = None, stdout: Any = None) -> int:
        anyio.run(self.run_stdio, stdin, stdout)
        return 0

class _PatchedServerSession(ServerSession):
    async def _handle_incoming(self, req: Any) -> None:
        # ServerSession's notification lifecycle is already handled in
        # _received_notification. Forwarding notifications into the request
        # stream can stall stdio subprocess mode in this environment.
        # Requests still need to reach Server.run() so the low-level server can
        # dispatch list_tools/call_tool handlers.
        if isinstance(req, RequestResponder):
            await self._incoming_message_stream_writer.send(req)


def main() -> int:
    server = McpServer()
    return server.serve_stdio()


if __name__ == "__main__":
    raise SystemExit(main())
