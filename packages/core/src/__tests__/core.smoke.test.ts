import { describe, expect, it } from "vitest";

import {
  buildCoreResultFromAdapterOutput,
  buildMarkdownReport,
  BuiltinProfiles,
  createEmptyCoreResult,
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
});
