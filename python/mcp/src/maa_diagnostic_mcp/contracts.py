from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONTRACT_FILENAMES = {
    "core_result": "core-result.schema.json",
    "core_error": "error.schema.json",
    "profile": "profile.schema.json",
    "maa_log_analyzer_batch_input": "maa-log-analyzer-batch-input.schema.json",
    "maa_log_analyzer_runtime_input": "maa-log-analyzer-runtime-input.schema.json",
}


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def resolve_contracts_dir() -> Path:
    return resolve_repo_root() / "contracts"


def get_contract_path(name: str) -> Path:
    try:
        filename = CONTRACT_FILENAMES[name]
    except KeyError as error:
        raise KeyError(f"Unknown contract name: {name}") from error

    return resolve_contracts_dir() / filename


def load_contract(name: str) -> dict[str, Any]:
    path = get_contract_path(name)
    return json.loads(path.read_text(encoding="utf-8"))
