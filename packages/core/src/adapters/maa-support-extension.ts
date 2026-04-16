import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import { ConfidenceSchema } from "../models/common.js";
import { FindingSchema } from "../models/finding.js";
import { ObservationSchema } from "../models/observation.js";
import { ReferenceSchema } from "../models/reference.js";

export const MaaSupportExtensionTaskDefinitionSchema = z.object({
  name: z.string().min(1),
  entry: z.string().min(1).nullable().default(null),
  label: z.string().min(1).nullable().default(null),
  description: z.string().min(1).nullable().default(null),
  groups: z.array(z.string().min(1)).default([]),
  controllers: z.array(z.string().min(1)).default([]),
  resources: z.array(z.string().min(1)).default([]),
  optionIds: z.array(z.string().min(1)).default([]),
  sourceFile: z.string().min(1),
  line: z.number().int().positive().optional()
});

export const MaaSupportExtensionOptionDefinitionSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).nullable().default(null),
  label: z.string().min(1).nullable().default(null),
  description: z.string().min(1).nullable().default(null),
  controllers: z.array(z.string().min(1)).default([]),
  resources: z.array(z.string().min(1)).default([]),
  caseNames: z.array(z.string().min(1)).default([]),
  nestedOptionIds: z.array(z.string().min(1)).default([]),
  overrideNodes: z.array(z.string().min(1)).default([]),
  sourceFile: z.string().min(1),
  line: z.number().int().positive().optional()
});

export const MaaSupportExtensionNodeDefinitionSchema = z.object({
  name: z.string().min(1),
  sourceFile: z.string().min(1),
  line: z.number().int().positive().optional(),
  resourceScope: z.string().min(1).nullable().default(null),
  next: z.array(z.string().min(1)).default([]),
  onError: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().nullable().default(null),
  recognizedKeys: z.array(z.string().min(1)).default([])
});

export const MaaSupportExtensionDiagnosticSchema = z.object({
  type: z.string().min(1),
  level: z.enum(["warning", "error"]),
  message: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  entity: z.string().min(1).optional()
});

export const MaaSupportExtensionProjectSummarySchema = z.object({
  project_root: z.string().min(1),
  interface_file: z.string().min(1),
  project_name: z.string().min(1).nullable().default(null),
  interface_version: z.number().int().nullable().default(null),
  controller_names: z.array(z.string().min(1)).default([]),
  resource_names: z.array(z.string().min(1)).default([]),
  task_count: z.number().int().nonnegative(),
  option_count: z.number().int().nonnegative(),
  pipeline_file_count: z.number().int().nonnegative(),
  node_count: z.number().int().nonnegative(),
  tasks: z.array(MaaSupportExtensionTaskDefinitionSchema).default([]),
  options: z.array(MaaSupportExtensionOptionDefinitionSchema).default([]),
  node_names: z.array(z.string().min(1)).default([])
});

export const MaaSupportExtensionTaskDefinitionResultSchema = z.object({
  query: z.string().min(1),
  matches: z.array(MaaSupportExtensionTaskDefinitionSchema).default([])
});

export const MaaSupportExtensionNodeDefinitionResultSchema = z.object({
  query: z.string().min(1),
  matches: z.array(MaaSupportExtensionNodeDefinitionSchema).default([])
});

export const MaaSupportExtensionDiagnosticResultSchema = z.object({
  diagnostics: z.array(MaaSupportExtensionDiagnosticSchema).default([]),
  summary: z.object({
    error_count: z.number().int().nonnegative(),
    warning_count: z.number().int().nonnegative()
  })
});

export const MaaSupportExtensionMethodSchema = z.enum([
  "parse_project",
  "get_task_definition",
  "get_node_definition",
  "run_project_diagnostic"
]);

export const MaaSupportExtensionEnvelopeSchema = z.object({
  request_id: z.string().min(1),
  api_version: z.string().min(1),
  ok: z.boolean(),
  data: z.unknown().nullable(),
  meta: z.object({
    duration_ms: z.number().nonnegative(),
    warnings: z.array(z.string()).default([])
  }),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean()
  }).nullable()
});

export const MaaSupportExtensionToolResultSchema = z.object({
  tool: MaaSupportExtensionMethodSchema,
  response: MaaSupportExtensionEnvelopeSchema
});

export const MaaSupportExtensionBatchInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  results: z.array(MaaSupportExtensionToolResultSchema).min(1)
});

export type MaaSupportExtensionTaskDefinition = z.infer<typeof MaaSupportExtensionTaskDefinitionSchema>;
export type MaaSupportExtensionOptionDefinition = z.infer<typeof MaaSupportExtensionOptionDefinitionSchema>;
export type MaaSupportExtensionNodeDefinition = z.infer<typeof MaaSupportExtensionNodeDefinitionSchema>;
export type MaaSupportExtensionDiagnostic = z.infer<typeof MaaSupportExtensionDiagnosticSchema>;
export type MaaSupportExtensionProjectSummary = z.infer<typeof MaaSupportExtensionProjectSummarySchema>;
export type MaaSupportExtensionMethod = z.infer<typeof MaaSupportExtensionMethodSchema>;
export type MaaSupportExtensionEnvelope = z.infer<typeof MaaSupportExtensionEnvelopeSchema>;
export type MaaSupportExtensionToolResult = z.infer<typeof MaaSupportExtensionToolResultSchema>;
export type MaaSupportExtensionBatchInput = z.infer<typeof MaaSupportExtensionBatchInputSchema>;

function buildCommonReferences(
  method: MaaSupportExtensionMethod,
  response: MaaSupportExtensionEnvelope
) {
  return [
    ReferenceSchema.parse({
      kind: "tool_result",
      locator: `maa-support-extension:${method}:${response.request_id}`,
      label: `${method} result`,
      sourceTool: "maa-support-extension",
      meta: {
        api_version: response.api_version
      }
    })
  ];
}

function buildFileReference(path: string, label: string, line?: number) {
  return ReferenceSchema.parse({
    kind: "source_file",
    locator: line ? `${path}:${line}` : path,
    label,
    sourceTool: "maa-support-extension",
    path,
    line
  });
}

export function buildMaaSupportExtensionObservationsForMethod(result: MaaSupportExtensionToolResult) {
  const { tool, response } = result;
  const references = buildCommonReferences(tool, response);
  const observations = [];

  if (!response.ok || !response.data) {
    observations.push(ObservationSchema.parse({
      id: `obs:${tool}:${response.request_id}:error`,
      kind: "tool_error",
      summary: `MaaSupportExtension ${tool} failed: ${response.error?.message ?? "unknown error"}`,
      sourceTool: "maa-support-extension",
      severity: "error",
      payload: {
        code: response.error?.code,
        retryable: response.error?.retryable ?? false
      },
      references
    }));
    return observations;
  }

  switch (tool) {
    case "parse_project": {
      const data = MaaSupportExtensionProjectSummarySchema.parse(response.data);
      observations.push(ObservationSchema.parse({
        id: `obs:${tool}:${response.request_id}:summary`,
        kind: "maa_project_summary",
        summary: `Parsed Maa project ${data.project_name ?? data.project_root} with ${data.task_count} tasks, ${data.option_count} options and ${data.node_count} nodes`,
        sourceTool: "maa-support-extension",
        payload: {
          project_root: data.project_root,
          interface_file: data.interface_file,
          task_count: data.task_count,
          option_count: data.option_count,
          node_count: data.node_count,
          controller_names: data.controller_names,
          resource_names: data.resource_names
        },
        references: [
          ...references,
          buildFileReference(data.interface_file, "interface.json")
        ]
      }));
      break;
    }

    case "get_task_definition": {
      const data = MaaSupportExtensionTaskDefinitionResultSchema.parse(response.data);
      for (const match of data.matches) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:${match.name}`,
          kind: "maa_task_definition",
          summary: `Task ${match.name} enters ${match.entry ?? "unknown"} with ${match.optionIds.length} options`,
          sourceTool: "maa-support-extension",
          payload: {
            name: match.name,
            entry: match.entry,
            option_ids: match.optionIds
          },
          references: [
            ...references,
            buildFileReference(match.sourceFile, match.name, match.line)
          ]
        }));
      }
      break;
    }

    case "get_node_definition": {
      const data = MaaSupportExtensionNodeDefinitionResultSchema.parse(response.data);
      for (const match of data.matches) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:${match.name}:${match.sourceFile}`,
          kind: "maa_node_definition",
          summary: `Node ${match.name} defines ${match.next.length} next branches and ${match.onError.length} on_error branches`,
          sourceTool: "maa-support-extension",
          payload: {
            name: match.name,
            next: match.next,
            on_error: match.onError,
            resource_scope: match.resourceScope
          },
          references: [
            ...references,
            buildFileReference(match.sourceFile, match.name, match.line)
          ]
        }));
      }
      break;
    }

    case "run_project_diagnostic": {
      const data = MaaSupportExtensionDiagnosticResultSchema.parse(response.data);
      observations.push(ObservationSchema.parse({
        id: `obs:${tool}:${response.request_id}:diagnostic`,
        kind: "maa_project_diagnostics",
        summary: `Maa project diagnostics produced ${data.summary.error_count} errors and ${data.summary.warning_count} warnings`,
        sourceTool: "maa-support-extension",
        severity: data.summary.error_count > 0 ? "error" : "warning",
        payload: data.summary,
        references: [
          ...references,
          ...data.diagnostics.slice(0, 5).map((item) => buildFileReference(item.file, item.message, item.line))
        ]
      }));
      break;
    }
  }

  return observations;
}

export function buildMaaSupportExtensionFindings(results: MaaSupportExtensionToolResult[]) {
  const findings = [];
  const missingEvidence = [];

  for (const result of results) {
    if (!result.response.ok || !result.response.data) {
      continue;
    }

    if (result.tool === "run_project_diagnostic") {
      const data = MaaSupportExtensionDiagnosticResultSchema.parse(result.response.data);
      if (data.summary.error_count > 0) {
        findings.push(FindingSchema.parse({
          id: `finding:mse-diagnostic:${result.response.request_id}`,
          kind: "maa_project_definition_errors",
          statement: `Maa project definition diagnostics reported ${data.summary.error_count} errors`,
          status: "confirmed",
          confidence: ConfidenceSchema.parse("high"),
          basisObservationIds: [
            `obs:run_project_diagnostic:${result.response.request_id}:diagnostic`
          ],
          supportingReferences: buildCommonReferences("run_project_diagnostic", result.response),
          gaps: [],
          tags: ["maa-support-extension", "project"]
        }));
      }
    }

    if (result.tool === "get_task_definition") {
      const data = MaaSupportExtensionTaskDefinitionResultSchema.parse(result.response.data);
      if (data.matches.length === 0) {
        missingEvidence.push({
          id: `missing:mse-task:${result.response.request_id}:${data.query}`,
          description: `MaaSupportExtension could not locate task definition ${data.query}`,
          priority: "high" as const,
          suggestedActions: [
            "Check whether the project import list includes this task.",
            "Provide the correct project root or interface file."
          ]
        });
      }
    }

    if (result.tool === "get_node_definition") {
      const data = MaaSupportExtensionNodeDefinitionResultSchema.parse(result.response.data);
      if (data.matches.length === 0) {
        missingEvidence.push({
          id: `missing:mse-node:${result.response.request_id}:${data.query}`,
          description: `MaaSupportExtension could not locate node definition ${data.query}`,
          priority: "medium" as const,
          suggestedActions: [
            "Check whether the node exists in the active resource pipeline.",
            "Provide a project snapshot that includes the relevant pipeline files."
          ]
        });
      }
    }
  }

  return { findings, missingEvidence };
}

export function normalizeMaaSupportExtensionResults(input: MaaSupportExtensionBatchInput): AdapterRunOutput {
  const normalized = MaaSupportExtensionBatchInputSchema.parse(input);
  const observations = normalized.results.flatMap(buildMaaSupportExtensionObservationsForMethod);
  const { findings, missingEvidence } = buildMaaSupportExtensionFindings(normalized.results);

  return {
    toolName: "maa-support-extension",
    rawResult: normalized.results,
    observations,
    findings,
    missingEvidence,
    profileHints: [
      {
        kind: "recommended_tool",
        value: "maa-support-extension",
        reason: "Use project definitions to map task and node names back to source files."
      }
    ]
  };
}

export const maaSupportExtensionResultAdapter: ToolAdapter<MaaSupportExtensionBatchInput> = {
  id: "maa-support-extension-result",

  normalize(input) {
    return normalizeMaaSupportExtensionResults(input);
  }
};

export const maaSupportExtensionAdapter = maaSupportExtensionResultAdapter;
