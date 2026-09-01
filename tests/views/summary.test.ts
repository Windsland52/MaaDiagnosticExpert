import { expect, test } from "vitest";

import {
  EVIDENCE_SCHEMA_VERSION,
  INSPECTION_SUMMARY_SCHEMA_VERSION,
  renderInspectionSummary,
  summarizeInspection,
  type InspectionResult,
} from "../../src/index.js";

function result(): InspectionResult {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: "mla",
    generatedAt: "2026-09-01T00:00:00.000Z",
    input: { path: "C:/materials", timeRange: { from: "2026-09-01T20:12:00.000Z" } },
    artifacts: [
      {
        id: "artifact-1",
        path: "C:/materials/maafw.log",
        relativePath: "maafw.log",
        kind: "maa_log",
        status: "selected",
      },
      {
        id: "artifact-2",
        path: "C:/materials/custom/2026-09-01.log",
        relativePath: "custom/2026-09-01.log",
        kind: "log",
        status: "available",
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        kind: "mla.action_detail",
        summary: "Action EatCandyStart succeeded (Click) x1.",
        source: { artifactId: "artifact-1", path: "maafw.log", line: 10 },
        data: {},
      },
      {
        id: "evidence-2",
        kind: "mla.action_detail",
        summary: "Action EatCandyStart succeeded (Click) x2.",
        source: { artifactId: "artifact-1", path: "maafw.log", line: 20 },
        data: {},
      },
      {
        id: "evidence-3",
        kind: "mla.pipeline_override",
        summary: "Observed task submission pipeline override for 7 nodes.",
        source: { artifactId: "artifact-1", path: "maafw.log", line: 30 },
        data: {},
      },
    ],
    missingEvidence: [],
    warnings: [{ code: "mla_signals_focused", message: "Selected 403 of 935 runtime signals." }],
    statistics: { scannedFiles: 15, evidence: 3 },
    details: { enormous: "x".repeat(10_000) },
  };
}

test("reduces an inspection to bounded summary blocks with the available evidence kinds", () => {
  const summary = summarizeInspection(result());

  expect(summary.schemaVersion).toBe(INSPECTION_SUMMARY_SCHEMA_VERSION);
  expect(summary.evidenceCount).toBe(3);
  expect(summary.evidenceKinds).toEqual([
    { kind: "mla.action_detail", count: 2 },
    { kind: "mla.pipeline_override", count: 1 },
  ]);
  expect(summary.artifacts).toHaveLength(2);
  expect(summary.warnings).toHaveLength(1);
  expect(summary).not.toHaveProperty("evidence");
  expect(summary).not.toHaveProperty("details");
});

test("keeps the rendered summary far smaller than the full inspection document", () => {
  const inspection = result();
  const summary = renderInspectionSummary(inspection, "json");

  expect(summary.length).toBeLessThan(JSON.stringify(inspection).length);
  expect(summary).not.toContain("enormous");
  expect(JSON.parse(summary)).toMatchObject({ evidenceCount: 3 });
});

test("renders a text summary that names artifacts, evidence kinds, and warnings", () => {
  const text = renderInspectionSummary(result(), "text");

  expect(text).toContain("MaaEvidenceKit mla inspection summary");
  expect(text).toContain("Artifacts: 1 selected / 2 reported");
  expect(text).toContain("artifact-2 [log/available] custom/2026-09-01.log");
  expect(text).toContain("- mla.pipeline_override: 1");
  expect(text).toContain("[mla_signals_focused]");
});
