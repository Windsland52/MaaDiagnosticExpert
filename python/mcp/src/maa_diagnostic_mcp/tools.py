from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import mcp.types as mcp_types

from .contracts import get_contract_path, load_contract
from .runtime import CoreCliRuntime


def _object_schema(
    properties: dict[str, Any],
    *,
    required: list[str] | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }

    if required:
        schema["required"] = required

    if description:
        schema["description"] = description

    return schema


def _nullable_string_schema(description: str) -> dict[str, Any]:
    return {
        "anyOf": [
            {
                "type": "string",
                "minLength": 1,
            },
            {
                "type": "null",
            },
        ],
        "description": description,
    }


CORE_RESULT_CONTRACT = load_contract("core_result")
PROFILE_CONTRACT = load_contract("profile")
PROFILE_CATALOG_CONTRACT = load_contract("profile_catalog")
RUNTIME_INFO_CONTRACT = load_contract("runtime_info")
CORPUS_CATALOG_CONTRACT = load_contract("corpus_catalog")
CORPUS_PREPARE_INPUT_CONTRACT = load_contract("corpus_prepare_input")
CORPUS_PREPARE_RESULT_CONTRACT = load_contract("corpus_prepare_result")
CORPUS_SEARCH_INPUT_CONTRACT = load_contract("corpus_search_input")
CORPUS_SEARCH_RESULT_CONTRACT = load_contract("corpus_search_result")
DIAGNOSTIC_PIPELINE_INPUT_CONTRACT = load_contract("diagnostic_pipeline_input")
FILESYSTEM_BATCH_INPUT_CONTRACT = load_contract("filesystem_batch_input")
FILESYSTEM_RUNTIME_INPUT_CONTRACT = load_contract("filesystem_runtime_input")
MLA_BATCH_INPUT_CONTRACT = load_contract("maa_log_analyzer_batch_input")
MLA_RUNTIME_INPUT_CONTRACT = load_contract("maa_log_analyzer_runtime_input")
MSE_BATCH_INPUT_CONTRACT = load_contract("maa_support_extension_batch_input")
MSE_RUNTIME_INPUT_CONTRACT = load_contract("maa_support_extension_runtime_input")

EMPTY_RESULT_INPUT_SCHEMA = _object_schema(
    {
        "profile_id": _nullable_string_schema("Optional builtin profile id."),
    }
)

VALIDATE_CORE_RESULT_INPUT_SCHEMA = _object_schema(
    {
        "result": CORE_RESULT_CONTRACT,
    },
    required=["result"],
)

RENDER_REPORT_INPUT_SCHEMA = _object_schema(
    {
        "result": CORE_RESULT_CONTRACT,
        "format": {
            "type": "string",
            "enum": ["markdown", "json"],
            "default": "markdown",
        },
    },
    required=["result"],
)

NORMALIZE_MLA_RESULT_INPUT_SCHEMA = _object_schema(
    {
        "input": MLA_BATCH_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

NORMALIZE_FILESYSTEM_RESULT_INPUT_SCHEMA = _object_schema(
    {
        "input": FILESYSTEM_BATCH_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

RUN_FILESYSTEM_RUNTIME_INPUT_SCHEMA = _object_schema(
    {
        "input": FILESYSTEM_RUNTIME_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

RUN_MLA_RUNTIME_INPUT_SCHEMA = _object_schema(
    {
        "input": MLA_RUNTIME_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

NORMALIZE_MSE_RESULT_INPUT_SCHEMA = _object_schema(
    {
        "input": MSE_BATCH_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

RUN_MSE_RUNTIME_INPUT_SCHEMA = _object_schema(
    {
        "input": MSE_RUNTIME_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

RUN_DIAGNOSTIC_PIPELINE_INPUT_SCHEMA = _object_schema(
    {
        "input": DIAGNOSTIC_PIPELINE_INPUT_CONTRACT,
        "with_report": {
            "type": "boolean",
            "default": False,
        },
    },
    required=["input"],
)

SHOW_BUILTIN_PROFILE_INPUT_SCHEMA = _object_schema(
    {
        "profile_id": {
            "type": "string",
            "minLength": 1,
        },
    },
    required=["profile_id"],
)

EMPTY_OBJECT_INPUT_SCHEMA = _object_schema({})


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]
    input_contract: str | None
    output_contract: str | None
    error_contract: str = "core_error"

    def to_dict(self) -> dict[str, str | None]:
        return {
            "name": self.name,
            "description": self.description,
            "input_contract": str(get_contract_path(self.input_contract)) if self.input_contract else None,
            "output_contract": str(get_contract_path(self.output_contract)) if self.output_contract else None,
            "error_contract": str(get_contract_path(self.error_contract)),
        }

    def to_mcp_tool(self) -> mcp_types.Tool:
        output_schema = load_contract(self.output_contract) if self.output_contract else None
        return mcp_types.Tool(
            name=self.name,
            description=self.description,
            inputSchema=self.input_schema,
            outputSchema=output_schema,
            annotations=mcp_types.ToolAnnotations(
                readOnlyHint=True,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=False,
            ),
        )


DEFAULT_TOOL_SPECS = [
    ToolSpec(
        name="empty_result",
        description="Create an empty CoreResult skeleton.",
        input_schema=EMPTY_RESULT_INPUT_SCHEMA,
        input_contract=None,
        output_contract="core_result",
    ),
    ToolSpec(
        name="validate_core_result",
        description="Validate a CoreResult payload against core contracts.",
        input_schema=VALIDATE_CORE_RESULT_INPUT_SCHEMA,
        input_contract="core_result",
        output_contract="core_result",
    ),
    ToolSpec(
        name="render_report",
        description="Render a CoreResult into markdown or report-json output.",
        input_schema=RENDER_REPORT_INPUT_SCHEMA,
        input_contract="core_result",
        output_contract=None,
    ),
    ToolSpec(
        name="normalize_filesystem_result",
        description="Normalize deterministic filesystem scan results into CoreResult.",
        input_schema=NORMALIZE_FILESYSTEM_RESULT_INPUT_SCHEMA,
        input_contract="filesystem_batch_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="run_filesystem_runtime",
        description="Run the local filesystem evidence adapter and return CoreResult.",
        input_schema=RUN_FILESYSTEM_RUNTIME_INPUT_SCHEMA,
        input_contract="filesystem_runtime_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="normalize_mla_result",
        description="Normalize existing Maa Log Analyzer tool results into CoreResult.",
        input_schema=NORMALIZE_MLA_RESULT_INPUT_SCHEMA,
        input_contract="maa_log_analyzer_batch_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="run_mla_runtime",
        description="Run Maa Log Analyzer through the local core runtime and return CoreResult.",
        input_schema=RUN_MLA_RUNTIME_INPUT_SCHEMA,
        input_contract="maa_log_analyzer_runtime_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="normalize_mse_result",
        description="Normalize existing Maa Support Extension tool results into CoreResult.",
        input_schema=NORMALIZE_MSE_RESULT_INPUT_SCHEMA,
        input_contract="maa_support_extension_batch_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="run_mse_runtime",
        description="Run Maa Support Extension through the local core runtime and return CoreResult.",
        input_schema=RUN_MSE_RUNTIME_INPUT_SCHEMA,
        input_contract="maa_support_extension_runtime_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="show_builtin_profile",
        description="Load a builtin profile by id.",
        input_schema=SHOW_BUILTIN_PROFILE_INPUT_SCHEMA,
        input_contract=None,
        output_contract="profile",
    ),
    ToolSpec(
        name="list_builtin_profiles",
        description="List builtin profiles exposed by the local core runtime.",
        input_schema=EMPTY_OBJECT_INPUT_SCHEMA,
        input_contract=None,
        output_contract="profile_catalog",
    ),
    ToolSpec(
        name="list_builtin_corpora",
        description="List builtin local corpora exposed by the local core runtime.",
        input_schema=EMPTY_OBJECT_INPUT_SCHEMA,
        input_contract=None,
        output_contract="corpus_catalog",
    ),
    ToolSpec(
        name="prepare_builtin_corpora",
        description="Prepare builtin local corpora into deterministic on-disk indexes.",
        input_schema=CORPUS_PREPARE_INPUT_CONTRACT,
        input_contract="corpus_prepare_input",
        output_contract="corpus_prepare_result",
    ),
    ToolSpec(
        name="search_local_corpus",
        description="Run deterministic local corpus search and return retrieval hits.",
        input_schema=CORPUS_SEARCH_INPUT_CONTRACT,
        input_contract="corpus_search_input",
        output_contract="corpus_search_result",
    ),
    ToolSpec(
        name="run_diagnostic_pipeline",
        description="Run the cross-tool diagnostic pipeline and return a merged CoreResult.",
        input_schema=RUN_DIAGNOSTIC_PIPELINE_INPUT_SCHEMA,
        input_contract="diagnostic_pipeline_input",
        output_contract="core_result",
    ),
    ToolSpec(
        name="describe_runtime",
        description="Describe the local core runtime, commands, adapters and contracts.",
        input_schema=EMPTY_OBJECT_INPUT_SCHEMA,
        input_contract=None,
        output_contract="runtime_info",
    ),
]


def list_tool_specs() -> list[ToolSpec]:
    return list(DEFAULT_TOOL_SPECS)


def get_tool_spec(name: str) -> ToolSpec:
    for spec in DEFAULT_TOOL_SPECS:
        if spec.name == name:
            return spec

    raise KeyError(f"Unknown tool: {name}")


class CoreToolset:
    def __init__(self, runtime: CoreCliRuntime | None = None) -> None:
        self.runtime = runtime or CoreCliRuntime()

    def empty_result(self, profile_id: str | None = None) -> dict[str, Any]:
        return self.runtime.empty_result(profile_id)

    def validate_core_result(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.runtime.validate_core_result(payload)

    def render_report(
        self, payload: dict[str, Any], *, format: str = "markdown"
    ) -> str | dict[str, Any]:
        return self.runtime.render_report(payload, format=format)

    def normalize_mla_result(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.normalize_mla_result(payload, with_report=with_report)

    def normalize_filesystem_result(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.normalize_filesystem_result(payload, with_report=with_report)

    def run_filesystem_runtime(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.run_filesystem_runtime(payload, with_report=with_report)

    def run_mla_runtime(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.run_mla_runtime(payload, with_report=with_report)

    def normalize_mse_result(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.normalize_mse_result(payload, with_report=with_report)

    def run_mse_runtime(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.run_mse_runtime(payload, with_report=with_report)

    def show_builtin_profile(self, profile_id: str) -> dict[str, Any]:
        return self.runtime.show_builtin_profile(profile_id)

    def list_builtin_profiles(self) -> dict[str, Any]:
        return self.runtime.list_builtin_profiles()

    def list_builtin_corpora(self) -> dict[str, Any]:
        return self.runtime.list_builtin_corpora()

    def prepare_builtin_corpora(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.runtime.prepare_builtin_corpora(payload)

    def search_local_corpus(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.runtime.search_local_corpus(payload)

    def run_diagnostic_pipeline(
        self, payload: dict[str, Any], *, with_report: bool = False
    ) -> dict[str, Any]:
        return self.runtime.run_diagnostic_pipeline(payload, with_report=with_report)

    def describe_runtime(self) -> dict[str, Any]:
        return self.runtime.describe_runtime()

    def invoke(
        self,
        tool_name: str,
        *,
        payload: dict[str, Any] | None = None,
        profile_id: str | None = None,
        format: str = "markdown",
        with_report: bool = False,
    ) -> str | dict[str, Any]:
        get_tool_spec(tool_name)

        if tool_name == "empty_result":
            return self.empty_result(profile_id)

        if tool_name == "validate_core_result":
            if payload is None:
                raise ValueError("payload is required for validate_core_result")
            return self.validate_core_result(payload)

        if tool_name == "render_report":
            if payload is None:
                raise ValueError("payload is required for render_report")
            return self.render_report(payload, format=format)

        if tool_name == "normalize_filesystem_result":
            if payload is None:
                raise ValueError("payload is required for normalize_filesystem_result")
            return self.normalize_filesystem_result(payload, with_report=with_report)

        if tool_name == "run_filesystem_runtime":
            if payload is None:
                raise ValueError("payload is required for run_filesystem_runtime")
            return self.run_filesystem_runtime(payload, with_report=with_report)

        if tool_name == "normalize_mla_result":
            if payload is None:
                raise ValueError("payload is required for normalize_mla_result")
            return self.normalize_mla_result(payload, with_report=with_report)

        if tool_name == "run_mla_runtime":
            if payload is None:
                raise ValueError("payload is required for run_mla_runtime")
            return self.run_mla_runtime(payload, with_report=with_report)

        if tool_name == "normalize_mse_result":
            if payload is None:
                raise ValueError("payload is required for normalize_mse_result")
            return self.normalize_mse_result(payload, with_report=with_report)

        if tool_name == "run_mse_runtime":
            if payload is None:
                raise ValueError("payload is required for run_mse_runtime")
            return self.run_mse_runtime(payload, with_report=with_report)

        if tool_name == "show_builtin_profile":
            if not profile_id:
                raise ValueError("profile_id is required for show_builtin_profile")
            return self.show_builtin_profile(profile_id)

        if tool_name == "list_builtin_profiles":
            return self.list_builtin_profiles()

        if tool_name == "list_builtin_corpora":
            return self.list_builtin_corpora()

        if tool_name == "prepare_builtin_corpora":
            if payload is None:
                raise ValueError("payload is required for prepare_builtin_corpora")
            return self.prepare_builtin_corpora(payload)

        if tool_name == "search_local_corpus":
            if payload is None:
                raise ValueError("payload is required for search_local_corpus")
            return self.search_local_corpus(payload)

        if tool_name == "run_diagnostic_pipeline":
            if payload is None:
                raise ValueError("payload is required for run_diagnostic_pipeline")
            return self.run_diagnostic_pipeline(payload, with_report=with_report)

        if tool_name == "describe_runtime":
            return self.describe_runtime()

        raise KeyError(f"Unknown tool: {tool_name}")

    def list_tool_specs(self) -> list[ToolSpec]:
        return list_tool_specs()
