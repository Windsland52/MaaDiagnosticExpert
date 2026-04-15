import type { CoreResult } from "../models/core-result.js";
import type { Finding } from "../models/finding.js";
import type { Observation } from "../models/observation.js";
import type { MissingEvidence, RetrievalHit } from "../models/retrieval.js";
import { RenderedReportSchema, type RenderedReport, type ReportSection } from "../models/report.js";

function renderObservationLines(observations: Observation[]): string {
  if (observations.length === 0) {
    return "- None";
  }

  return observations.map((item) => `- ${item.summary}`).join("\n");
}

function renderFindingLines(findings: Finding[]): string {
  if (findings.length === 0) {
    return "- None";
  }

  return findings
    .map((item) => `- [${item.confidence}] ${item.statement}`)
    .join("\n");
}

function renderMissingEvidenceLines(items: MissingEvidence[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map((item) => `- [${item.priority}] ${item.description}`)
    .join("\n");
}

function renderRetrievalLines(items: RetrievalHit[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items
    .map((item) => `- ${item.corpus}: ${item.path}${item.section ? `#${item.section}` : ""}`)
    .join("\n");
}

export function buildMarkdownReport(result: CoreResult): RenderedReport {
  if (result.report?.format === "markdown") {
    return RenderedReportSchema.parse(result.report);
  }

  const sections: ReportSection[] = [
    {
      id: "summary",
      title: "Summary",
      content: `Profile: ${result.profileId ?? "none"}`
    },
    {
      id: "observations",
      title: "Observations",
      content: renderObservationLines(result.diagnosticMeta.observations)
    },
    {
      id: "findings",
      title: "Findings",
      content: renderFindingLines(result.diagnosticMeta.findings)
    },
    {
      id: "retrieval",
      title: "Retrieval Hits",
      content: renderRetrievalLines(result.diagnosticMeta.retrievalHits)
    },
    {
      id: "missing-evidence",
      title: "Missing Evidence",
      content: renderMissingEvidenceLines(result.diagnosticMeta.missingEvidence)
    }
  ];

  const body = sections
    .map((section) => `## ${section.title}\n\n${section.content}`)
    .join("\n\n");

  return RenderedReportSchema.parse({
    format: "markdown",
    title: "Maa Diagnostic Report",
    sections,
    body
  });
}

export function renderCoreResultMarkdown(result: CoreResult): string {
  return buildMarkdownReport(result).body;
}
