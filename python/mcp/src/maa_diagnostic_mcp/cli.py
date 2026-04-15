from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .contracts import CONTRACT_FILENAMES, load_contract
from .errors import CoreCliError
from .server import McpServer
from .tools import CoreToolset, get_tool_spec, list_tool_specs


def _read_json_input(input_path: str | None) -> dict[str, Any] | None:
    if not input_path:
        return None

    path = Path(input_path)
    return json.loads(path.read_text(encoding="utf-8"))


def _write_output(value: str | dict[str, Any] | list[dict[str, Any]]) -> None:
    if isinstance(value, str):
        sys.stdout.write(f"{value}\n")
        return

    sys.stdout.write(f"{json.dumps(value, ensure_ascii=False, indent=2)}\n")


def _write_error(error: Exception) -> None:
    if isinstance(error, CoreCliError) and error.core_error:
        sys.stderr.write(f"{json.dumps(error.core_error, ensure_ascii=False, indent=2)}\n")
        return

    sys.stderr.write(f"{error}\n")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="maa-diagnostic-mcp")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_tools_parser = subparsers.add_parser("list-tools")
    list_tools_parser.add_argument("--format", choices=["json", "text"], default="json")

    show_contract_parser = subparsers.add_parser("show-contract")
    show_contract_parser.add_argument("--name", choices=sorted(CONTRACT_FILENAMES), required=True)

    invoke_parser = subparsers.add_parser("invoke")
    invoke_parser.add_argument("--tool", required=True)
    invoke_parser.add_argument("--input")
    invoke_parser.add_argument("--profile-id")
    invoke_parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    invoke_parser.add_argument("--with-report", action="store_true")

    subparsers.add_parser("serve-stdio")

    return parser


def _render_tool_specs(output_format: str) -> str | list[dict[str, Any]]:
    specs = [item.to_dict() for item in list_tool_specs()]
    if output_format == "json":
        return specs

    lines = [
        f"{item['name']}: {item['description']}"
        for item in specs
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    if argv and argv[0] == "--":
        argv = argv[1:]

    parser = _build_parser()
    args = parser.parse_args(argv)
    toolset = CoreToolset()

    try:
        if args.command == "list-tools":
            _write_output(_render_tool_specs(args.format))
            return 0

        if args.command == "show-contract":
            _write_output(load_contract(args.name))
            return 0

        if args.command == "invoke":
            get_tool_spec(args.tool)
            payload = _read_json_input(args.input)
            result = toolset.invoke(
                args.tool,
                payload=payload,
                profile_id=args.profile_id,
                format=args.format,
                with_report=args.with_report,
            )
            _write_output(result)
            return 0

        if args.command == "serve-stdio":
            return McpServer(toolset=toolset).serve_stdio()

        parser.print_help()
        return 0
    except (CoreCliError, KeyError, ValueError, OSError, json.JSONDecodeError) as error:
        _write_error(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
