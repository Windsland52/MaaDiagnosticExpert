from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from .contracts import resolve_repo_root
from .errors import build_process_error


class CoreCliRuntime:
    def __init__(
        self,
        *,
        repo_root: Path | None = None,
        core_cli_path: Path | None = None,
        core_bin: str | None = None,
        node_bin: str | None = None,
    ) -> None:
        self.repo_root = repo_root or resolve_repo_root()
        self.contracts_dir = self.repo_root / "contracts"
        self.core_cli_path = core_cli_path or Path(
            os.environ.get(
                "MAA_DIAGNOSTIC_CORE_CLI_JS",
                str(self.repo_root / "packages" / "core" / "dist" / "cli.js"),
            )
        )
        self.core_bin = core_bin or os.environ.get("MAA_DIAGNOSTIC_CORE_BIN")
        self.node_bin = node_bin or os.environ.get("MAA_DIAGNOSTIC_NODE_BIN", "node")

    def _base_command(self) -> list[str]:
        if self.core_bin:
            return [self.core_bin]

        return [self.node_bin, str(self.core_cli_path)]

    def _run(
        self,
        command: str,
        *,
        payload: Any | None = None,
        args: list[str] | None = None,
        parse_json: bool = True,
    ) -> Any:
        command_line = [*self._base_command(), command]
        if args:
            command_line.extend(args)

        command_line.append("--json-error")

        with TemporaryDirectory(prefix="maa-diagnostic-mcp-") as temp_dir:
            if payload is not None:
                input_path = Path(temp_dir) / "input.json"
                input_path.write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                command_line.extend(["--input", str(input_path)])

            completed = subprocess.run(
                command_line,
                cwd=self.repo_root,
                check=False,
                capture_output=True,
                text=True,
            )

        if completed.returncode != 0:
            raise build_process_error(command_line, completed)

        output = completed.stdout.strip()
        if not parse_json:
            return output

        if not output:
            return {}

        return json.loads(output)

    def help_text(self) -> str:
        return self._run("help", parse_json=False)

    def empty_result(self, profile_id: str | None = None) -> dict[str, Any]:
        args: list[str] = []
        if profile_id:
            args.extend(["--profile", profile_id])
        return self._run("empty-result", args=args)

    def validate_core_result(self, result: dict[str, Any]) -> dict[str, Any]:
        return self._run("validate-core-result", payload=result)

    def render_report(self, result: dict[str, Any], *, format: str = "markdown") -> str | dict[str, Any]:
        parse_json = format == "json"
        return self._run("render-report", payload=result, args=["--format", format], parse_json=parse_json)

    def normalize_mla_result(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        args = ["--with-report"] if with_report else []
        return self._run("normalize-mla-result", payload=payload, args=args)

    def run_mla_runtime(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        args = ["--with-report"] if with_report else []
        return self._run("run-mla-runtime", payload=payload, args=args)

    def validate_profile(self, profile_path: str | Path) -> dict[str, Any]:
        return self._run("validate-profile", args=["--input", str(profile_path)])

    def show_builtin_profile(self, profile_id: str) -> dict[str, Any]:
        return self._run("show-builtin-profile", args=["--id", profile_id])
