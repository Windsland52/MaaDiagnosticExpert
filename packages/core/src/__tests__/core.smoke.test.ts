import { describe, expect, it } from "vitest";

import {
  buildCoreResultFromAdapterOutput,
  buildMarkdownReport,
  BuiltinProfiles,
  createEmptyCoreResult,
  ObservationSchema,
  normalizeMaaLogAnalyzerResults
} from "../index.js";

describe("core smoke", () => {
  it("creates an empty core result", () => {
    const result = createEmptyCoreResult("generic-maa-log");

    expect(result.apiVersion).toBe("core/v1");
    expect(result.profileId).toBe("generic-maa-log");
    expect(result.diagnosticMeta.observations).toEqual([]);
  });

  it("exposes builtin profile", () => {
    expect(BuiltinProfiles.genericMaaLog.id).toBe("generic-maa-log");
    expect(BuiltinProfiles.genericMaaLog.recommendedTools.length).toBeGreaterThan(0);
  });

  it("normalizes MLA result payload into core result", () => {
    const adapterOutput = normalizeMaaLogAnalyzerResults({
      profileId: "generic-maa-log",
      results: [
        {
          tool: "parse_log_bundle",
          response: {
            request_id: "req-1",
            api_version: "v1",
            ok: true,
            data: {
              session_id: "s-1",
              task_count: 1,
              event_count: 6,
              warnings: []
            },
            meta: {
              duration_ms: 10,
              warnings: []
            },
            error: null
          }
        }
      ]
    });

    const result = buildCoreResultFromAdapterOutput(adapterOutput, "generic-maa-log");
    const report = buildMarkdownReport(result);

    expect(result.rawToolResults["maa-log-analyzer"]).toBeDefined();
    expect(result.diagnosticMeta.observations).toHaveLength(1);
    expect(report.format).toBe("markdown");
    expect(report.body).toContain("Summary");
  });

  it("surfaces MLA-linked image evidences as core observations and references", () => {
    const adapterOutput = normalizeMaaLogAnalyzerResults({
      profileId: "generic-maa-log",
      results: [
        {
          tool: "get_task_overview",
          response: {
            request_id: "req-image",
            api_version: "v1",
            ok: true,
            data: {
              task: {
                task_id: 7,
                entry: "FailedTask",
                status: "success",
                duration_ms: 1234
              },
              summary: {
                node_count: 1,
                failed_node_count: 1,
                reco_failed_count: 0
              },
              evidences: [
                {
                  evidence_id: "evi-image",
                  source_tool: "image_projection",
                  source_range: {
                    session_id: "session-1",
                    task_id: 7,
                    node_id: 701,
                    occurrence_index: 1
                  },
                  payload: {
                    image_kind: "error",
                    image_path: "/tmp/failed-node.png",
                    scope_kind: "pipeline_node",
                    scope_name: "FailedNode"
                  },
                  confidence: 1
                }
              ]
            },
            meta: {
              duration_ms: 10,
              warnings: []
            },
            error: null
          }
        }
      ]
    });

    const imageObservation = adapterOutput.observations?.find((item) => item.kind === "scope_image_evidence");
    expect(imageObservation).toBeDefined();
    expect(imageObservation?.summary).toContain("failed-node.png");
    expect(imageObservation?.payload.image_path).toBe("/tmp/failed-node.png");
    expect(imageObservation?.references.some((item) => item.kind === "image" && item.path === "/tmp/failed-node.png")).toBe(true);
  });

  it("renders screenshot evidence semantics into the markdown template", () => {
    const result = createEmptyCoreResult("generic-maa-log");
    result.diagnosticMeta.observations.push(
      ObservationSchema.parse({
        id: "obs:filesystem:image:1",
        kind: "error_screenshot",
        summary: "Found screenshot evidence on_error/history.png",
        sourceTool: "filesystem",
        payload: {
          path: "/tmp/on_error/history.png",
          relative_path: "on_error/history.png"
        },
        references: []
      }),
      ObservationSchema.parse({
        id: "obs:mla:image:1",
        kind: "scope_image_evidence",
        summary: "Associated error image current.png with pipeline_node CurrentNode",
        sourceTool: "maa-log-analyzer",
        payload: {
          image_kind: "error",
          image_path: "/tmp/on_error/current.png",
          scope_kind: "pipeline_node",
          scope_name: "CurrentNode"
        },
        references: []
      })
    );

    const report = buildMarkdownReport(result);

    expect(report.body).toContain("## Screenshot Evidence");
    expect(report.body).toContain("Bundle Screenshot Files: 1");
    expect(report.body).toContain("MLA-Matched Screenshots For Current Scope: 1");
    expect(report.body).toContain("Task success/failure follows MaaFramework task lifecycle callbacks.");
  });
});
