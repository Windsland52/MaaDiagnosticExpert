from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from typing import Any


def parse_core_error(stderr: str) -> dict[str, Any] | None:
    payload = stderr.strip()
    if not payload:
        return None

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


class CoreCliError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        command: Sequence[str],
        returncode: int,
        stdout: str,
        stderr: str,
        core_error: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.command = tuple(command)
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self.core_error = core_error

    @property
    def code(self) -> str | None:
        value = self.core_error.get("code") if self.core_error else None
        return value if isinstance(value, str) else None

    @property
    def retryable(self) -> bool | None:
        value = self.core_error.get("retryable") if self.core_error else None
        return value if isinstance(value, bool) else None


def build_process_error(
    command: Sequence[str], completed: subprocess.CompletedProcess[str]
) -> CoreCliError:
    core_error = parse_core_error(completed.stderr)
    if core_error and isinstance(core_error.get("message"), str):
        message = core_error["message"]
    else:
        message = f"core command failed with exit code {completed.returncode}"

    return CoreCliError(
        message,
        command=command,
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
        core_error=core_error,
    )
