# Python MCP Stdio Investigation

## Scope

This note records the current state of `python/mcp` stdio interoperability after
switching from a hand-written JSON-RPC server to the official Python `mcp` SDK.

Affected package:

- `python/mcp`

Validated SDK version:

- `mcp==1.27.0`

## Current status

Working:

- Official `mcp` low-level `Server`
- Official `mcp.types.Tool`
- Official `ClientSession` against the server in-process
- Repository test suite for runtime, contracts, CLI and in-process MCP tool calls

Experimental:

- External subprocess stdio interoperability through the official
  `mcp.client.stdio.stdio_client`

## Symptoms observed

The official SDK works in-process, but subprocess stdio behavior is unstable in
this environment.

Observed failures:

- `ClientSession.initialize()` may time out when the server is launched as a
  subprocess.
- In raw protocol experiments, `initialize` sometimes succeeds but subsequent
  `tools/list` may stall.
- The stall is sensitive to the `notifications/initialized` step and the server
  session's post-initialize lifecycle.

## What was verified

1. The issue is not caused by the old hand-written JSON-RPC implementation.
   `python/mcp` now uses the official `mcp` server types and handlers.
2. The issue is not in the tool registry itself.
   `list_tools` and `call_tool` both work through the official session in
   process.
3. The issue is not in `core`.
   `core` tests stay green throughout these experiments.
4. The issue is not simply caused by one large tool payload.
   The largest tool schema is large but still in a reasonable range for line
   based stdio output.

## Local mitigations currently in place

1. `python/mcp` keeps using the official SDK for server definitions and handler
   dispatch.
2. The repository test suite treats subprocess stdio interoperability as
   experimental and skips that specific smoke test for now.
3. `server.py` contains narrowly scoped compatibility comments around the
   notification path that showed environment-sensitive behavior during
   investigation.

## Why this is acceptable for now

The project goal is to make `core` and `python/mcp` usable building blocks for
other agents and tools. The main risk right now is not domain logic but transport
stability in one specific subprocess stdio path.

Blocking the whole repository on that path would slow down:

- contract evolution
- tool surface design
- core capability work
- future MCP transport choices

So the practical choice is:

- keep the official SDK integration
- keep stable tests on the in-process path
- track subprocess stdio as a follow-up item

## Recommended follow-up

1. Reproduce the same behavior outside the current workspace layout with a
   minimal standalone repo.
2. Check whether the issue still exists on newer `mcp` versions before changing
   local compatibility code.
3. If the issue persists, open an upstream report with:
   - minimal subprocess repro
   - environment details
   - observed difference between in-process and subprocess behavior
4. Consider adding an alternative transport later if subprocess stdio remains
   unreliable in the target deployment environment.
