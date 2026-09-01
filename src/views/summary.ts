import type {
  Artifact,
  InspectionInput,
  InspectionKind,
  InspectionResult,
  InspectionWarning,
  MissingEvidence,
} from "../evidence/index.js";

export const INSPECTION_SUMMARY_SCHEMA_VERSION = "maa-evidence-summary/v1" as const;

const MAX_TEXT_ARTIFACTS = 50;

export type InspectionEvidenceKindCount = {
  kind: string;
  count: number;
};

export type InspectionSummary = {
  schemaVersion: typeof INSPECTION_SUMMARY_SCHEMA_VERSION;
  kind: InspectionKind;
  generatedAt: string;
  input: InspectionInput;
  artifacts: Artifact[];
  missingEvidence: MissingEvidence[];
  warnings: InspectionWarning[];
  statistics: Record<string, number>;
  evidenceCount: number;
  evidenceKinds: InspectionEvidenceKindCount[];
};

/**
 * Reduce an inspection to its bounded summary blocks. The evidence ledger and the details payload
 * dominate a full result, so a harness that only needs artifacts, warnings, statistics, and the
 * available evidence kinds should read this instead of the whole document.
 */
export function summarizeInspection(result: InspectionResult): InspectionSummary {
  const counts = new Map<string, number>();
  for (const evidence of result.evidence) {
    counts.set(evidence.kind, (counts.get(evidence.kind) ?? 0) + 1);
  }
  return {
    schemaVersion: INSPECTION_SUMMARY_SCHEMA_VERSION,
    kind: result.kind,
    generatedAt: result.generatedAt,
    input: result.input,
    artifacts: result.artifacts,
    missingEvidence: result.missingEvidence,
    warnings: result.warnings,
    statistics: result.statistics,
    evidenceCount: result.evidence.length,
    evidenceKinds: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => left.kind.localeCompare(right.kind)),
  };
}

function renderSummaryText(summary: InspectionSummary): string {
  const selected = summary.artifacts.filter((artifact) => artifact.status === "selected").length;
  const lines = [
    `MaaEvidenceKit ${summary.kind} inspection summary`,
    `Input: ${summary.input.path}`,
  ];
  if (summary.input.timeRange !== undefined) {
    lines.push(`Time range: ${summary.input.timeRange.from ?? "start"} .. ${summary.input.timeRange.to ?? "end"}`);
  }
  lines.push(`Artifacts: ${selected} selected / ${summary.artifacts.length} reported`);
  for (const artifact of summary.artifacts.slice(0, MAX_TEXT_ARTIFACTS)) {
    lines.push(`- ${artifact.id} [${artifact.kind}/${artifact.status}] ${artifact.relativePath}`);
  }
  if (summary.artifacts.length > MAX_TEXT_ARTIFACTS) {
    lines.push(`- ... ${summary.artifacts.length - MAX_TEXT_ARTIFACTS} more artifacts in the JSON summary`);
  }
  lines.push(`Evidence: ${summary.evidenceCount}`);
  for (const entry of summary.evidenceKinds) lines.push(`- ${entry.kind}: ${entry.count}`);
  if (Object.keys(summary.statistics).length > 0) {
    lines.push("Statistics:");
    for (const [key, value] of Object.entries(summary.statistics)) lines.push(`- ${key}: ${value}`);
  }
  lines.push(`Missing evidence: ${summary.missingEvidence.length}`);
  for (const missing of summary.missingEvidence) {
    lines.push(`- [${missing.code}] ${missing.message}`);
  }
  lines.push(`Warnings: ${summary.warnings.length}`);
  for (const warning of summary.warnings) lines.push(`- [${warning.code}] ${warning.message}`);
  return lines.join("\n");
}

export type SummaryFormat = "json" | "text";

export function renderInspectionSummary(
  result: InspectionResult,
  format: SummaryFormat = "json",
  pretty = true,
): string {
  const summary = summarizeInspection(result);
  return format === "json" ? JSON.stringify(summary, null, pretty ? 2 : 0) : renderSummaryText(summary);
}
