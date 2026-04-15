import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import { ConfidenceSchema } from "../models/common.js";
import { FindingSchema } from "../models/finding.js";
import { ObservationSchema } from "../models/observation.js";
import { ReferenceSchema } from "../models/reference.js";

export const MaaLogAnalyzerMethodSchema = z.enum([
  "parse_log_bundle",
  "get_task_overview",
  "get_node_timeline",
  "get_next_list_history",
  "get_parent_chain",
  "get_raw_lines"
]);

export const MaaLogAnalyzerEnvelopeSchema = z.object({
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

export const MaaLogAnalyzerToolResultSchema = z.object({
  tool: MaaLogAnalyzerMethodSchema,
  response: MaaLogAnalyzerEnvelopeSchema
});

export const MaaLogAnalyzerBatchInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  results: z.array(MaaLogAnalyzerToolResultSchema).min(1)
});

export type MaaLogAnalyzerMethod = z.infer<typeof MaaLogAnalyzerMethodSchema>;
export type MaaLogAnalyzerEnvelope = z.infer<typeof MaaLogAnalyzerEnvelopeSchema>;
export type MaaLogAnalyzerToolResult = z.infer<typeof MaaLogAnalyzerToolResultSchema>;
export type MaaLogAnalyzerBatchInput = z.infer<typeof MaaLogAnalyzerBatchInputSchema>;

export function buildMaaLogAnalyzerCommonReferences(
  method: MaaLogAnalyzerMethod,
  response: MaaLogAnalyzerEnvelope
) {
  return [
    ReferenceSchema.parse({
      kind: "tool_result",
      locator: `maa-log-analyzer:${method}:${response.request_id}`,
      label: `${method} result`,
      sourceTool: "maa-log-analyzer",
      meta: {
        api_version: response.api_version
      }
    })
  ];
}

export function buildMaaLogAnalyzerObservationsForMethod(result: MaaLogAnalyzerToolResult) {
  const { tool, response } = result;
  const references = buildMaaLogAnalyzerCommonReferences(tool, response);
  const observations = [];

  if (!response.ok || !response.data) {
    observations.push(ObservationSchema.parse({
      id: `obs:${tool}:${response.request_id}:error`,
      kind: "tool_error",
      summary: `MaaLogAnalyzer ${tool} failed: ${response.error?.message ?? "unknown error"}`,
      sourceTool: "maa-log-analyzer",
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
    case "parse_log_bundle": {
      const data = z.object({
        session_id: z.string().min(1),
        task_count: z.number().int().nonnegative(),
        event_count: z.number().int().nonnegative(),
        warnings: z.array(z.string()).default([])
      }).parse(response.data);

      observations.push(ObservationSchema.parse({
        id: `obs:${tool}:${response.request_id}:session`,
        kind: "log_bundle_session",
        summary: `Parsed log bundle into session ${data.session_id} with ${data.task_count} tasks and ${data.event_count} events`,
        sourceTool: "maa-log-analyzer",
        payload: data,
        references
      }));
      break;
    }

    case "get_task_overview": {
      const data = z.object({
        task: z.object({
          task_id: z.number().int(),
          entry: z.string().min(1),
          status: z.enum(["success", "failed", "running"]),
          duration_ms: z.number().nonnegative()
        }).nullable(),
        summary: z.object({
          node_count: z.number().int().nonnegative(),
          failed_node_count: z.number().int().nonnegative(),
          reco_failed_count: z.number().int().nonnegative()
        }),
        evidences: z.array(z.unknown()).default([])
      }).parse(response.data);

      if (data.task) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:task`,
          kind: "task_overview",
          summary: `Task ${data.task.entry} (#${data.task.task_id}) ended with status ${data.task.status}`,
          sourceTool: "maa-log-analyzer",
          payload: data,
          references
        }));
      }
      break;
    }

    case "get_node_timeline": {
      const data = z.object({
        timeline: z.array(z.object({
          scope_id: z.string().min(1),
          occurrence_index: z.number().int().positive(),
          ts: z.string().min(1),
          event: z.string().min(1),
          node_id: z.number().int(),
          name: z.string().min(1),
          source_key: z.string().nullable(),
          line: z.number().int().positive().nullable()
        })),
        evidences: z.array(z.unknown()).default([])
      }).parse(response.data);

      if (data.timeline.length > 0) {
        const first = data.timeline[0];
        const last = data.timeline.at(-1) ?? first;

        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:timeline`,
          kind: "node_timeline",
          summary: `Node ${first.name} (#${first.node_id}) has ${data.timeline.length} timeline events from ${first.event} to ${last.event}`,
          sourceTool: "maa-log-analyzer",
          payload: data,
          references: [
            ...references,
            ...data.timeline
              .filter((item) => item.source_key && item.line)
              .slice(0, 5)
              .map((item) => ReferenceSchema.parse({
                kind: "log_line",
                locator: `${item.source_key}:${item.line}`,
                label: `${item.name}:${item.event}`,
                sourceTool: "maa-log-analyzer",
                path: item.source_key ?? undefined,
                line: item.line ?? undefined
              }))
          ]
        }));
      }
      break;
    }

    case "get_next_list_history": {
      const data = z.object({
        history: z.array(z.object({
          scope_id: z.string().min(1),
          occurrence_index: z.number().int().positive(),
          source_key: z.string().nullable(),
          line: z.number().int().positive().nullable(),
          candidates: z.array(z.object({
            name: z.string().min(1),
            anchor: z.boolean(),
            jump_back: z.boolean()
          })),
          outcome: z.enum(["succeeded", "failed", "unknown"])
        })),
        evidences: z.array(z.unknown()).default([])
      }).parse(response.data);

      if (data.history.length > 0) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:next-list`,
          kind: "next_list_history",
          summary: `Collected ${data.history.length} next-list history entries`,
          sourceTool: "maa-log-analyzer",
          payload: data,
          references
        }));
      }
      break;
    }

    case "get_parent_chain": {
      const data = z.object({
        chain: z.array(z.object({
          scope_id: z.string().min(1),
          scope_kind: z.enum([
            "task",
            "pipeline_node",
            "recognition_node",
            "action_node",
            "next_list",
            "recognition",
            "action",
            "wait_freezes"
          ]),
          task_id: z.number().int().optional(),
          node_id: z.number().int().optional(),
          name: z.string().min(1),
          occurrence_index: z.number().int().positive().optional(),
          relation: z.enum(["self", "parent", "ancestor"])
        })),
        evidences: z.array(z.unknown()).default([])
      }).parse(response.data);

      if (data.chain.length > 0) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:chain`,
          kind: "parent_chain",
          summary: `Collected parent chain with ${data.chain.length} scopes`,
          sourceTool: "maa-log-analyzer",
          payload: data,
          references
        }));
      }
      break;
    }

    case "get_raw_lines": {
      const data = z.object({
        lines: z.array(z.object({
          source_key: z.string().min(1),
          line: z.number().int().positive(),
          text: z.string()
        })),
        evidences: z.array(z.unknown()).default([])
      }).parse(response.data);

      if (data.lines.length > 0) {
        observations.push(ObservationSchema.parse({
          id: `obs:${tool}:${response.request_id}:raw-lines`,
          kind: "raw_lines",
          summary: `Retrieved ${data.lines.length} raw log lines`,
          sourceTool: "maa-log-analyzer",
          payload: {
            line_count: data.lines.length
          },
          references: [
            ...references,
            ...data.lines.slice(0, 10).map((item) => ReferenceSchema.parse({
              kind: "log_line",
              locator: `${item.source_key}:${item.line}`,
              label: item.text.slice(0, 80),
              sourceTool: "maa-log-analyzer",
              path: item.source_key,
              line: item.line
            }))
          ]
        }));
      }
      break;
    }
  }

  return observations;
}

export function buildMaaLogAnalyzerFindings(results: MaaLogAnalyzerToolResult[]) {
  const findings = [];

  const taskOverview = results.find((item) => item.tool === "get_task_overview" && item.response.ok && item.response.data);
  if (taskOverview?.response.data) {
    const data = z.object({
      task: z.object({
        task_id: z.number().int(),
        entry: z.string().min(1),
        status: z.enum(["success", "failed", "running"]),
        duration_ms: z.number().nonnegative()
      }).nullable(),
      summary: z.object({
        node_count: z.number().int().nonnegative(),
        failed_node_count: z.number().int().nonnegative(),
        reco_failed_count: z.number().int().nonnegative()
      })
    }).parse(taskOverview.response.data);

    if (data.task) {
      findings.push(FindingSchema.parse({
        id: `finding:task-overview:${taskOverview.response.request_id}`,
        kind: "task_status",
        statement: `Task ${data.task.entry} finished with status ${data.task.status}`,
        status: data.task.status === "failed" ? "confirmed" : "likely",
        confidence: ConfidenceSchema.parse(data.task.status === "failed" ? "high" : "medium"),
        basisObservationIds: [
          `obs:get_task_overview:${taskOverview.response.request_id}:task`
        ],
        supportingReferences: buildMaaLogAnalyzerCommonReferences("get_task_overview", taskOverview.response),
        gaps: [],
        tags: ["maa-log-analyzer", "task"]
      }));
    }
  }

  return findings;
}

export function normalizeMaaLogAnalyzerResults(input: MaaLogAnalyzerBatchInput): AdapterRunOutput {
  const normalized = MaaLogAnalyzerBatchInputSchema.parse(input);
  const observations = normalized.results.flatMap(buildMaaLogAnalyzerObservationsForMethod);
  const findings = buildMaaLogAnalyzerFindings(normalized.results);

  return {
    toolName: "maa-log-analyzer",
    rawResult: normalized.results,
    observations,
    findings,
    profileHints: [
      {
        kind: "recommended_tool",
        value: "maa-log-analyzer",
        reason: "Prefer deterministic Maa log analysis over free-form inference."
      }
    ]
  };
}

export const maaLogAnalyzerResultAdapter: ToolAdapter<MaaLogAnalyzerBatchInput> = {
  id: "maa-log-analyzer-result",

  normalize(input) {
    return normalizeMaaLogAnalyzerResults(input);
  }
};

export const maaLogAnalyzerAdapter = maaLogAnalyzerResultAdapter;
