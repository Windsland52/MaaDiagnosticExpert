import type { CoreResult } from "../models/core-result.js";
import type { Finding } from "../models/finding.js";
import type { Observation } from "../models/observation.js";
import type { MissingEvidence, RetrievalHit } from "../models/retrieval.js";
import { RenderedReportSchema, type RenderedReport, type ReportSection } from "../models/report.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function renderSummaryLines(result: CoreResult): string {
  const taskStatusFindings = result.diagnosticMeta.findings
    .filter((item) => item.kind === "task_status")
    .slice(0, 5);

  const lines = [
    `- Profile: ${result.profileId ?? "none"}`,
    `- Observations: ${result.diagnosticMeta.observations.length}`,
    `- Findings: ${result.diagnosticMeta.findings.length}`,
    `- Missing Evidence Items: ${result.diagnosticMeta.missingEvidence.length}`,
    ...taskStatusFindings.map((item) => `- Task Status: ${item.statement}`)
  ];

  return lines.join("\n");
}

function renderTaskSemanticsLines(): string {
  return [
    "- Task success/failure follows MaaFramework task lifecycle callbacks.",
    "- Intermediate `Node.*.Failed` events may be handled by `on_error` or branch transitions and do not automatically imply a task-level contradiction."
  ].join("\n");
}

function renderScreenshotEvidenceLines(result: CoreResult): string {
  const bundleScreenshotObservations = result.diagnosticMeta.observations.filter((item) => item.kind === "error_screenshot");
  const matchedScreenshotObservations = result.diagnosticMeta.observations.filter((item) => item.kind === "scope_image_evidence");
  const bundlePaths = [...new Set(bundleScreenshotObservations.flatMap((item) => {
    const payloadPath = readString(item.payload.path) ?? readString(item.payload.relative_path);
    return payloadPath ? [payloadPath] : [];
  }))];
  const matchedItems = [...new Map(matchedScreenshotObservations.map((item) => {
    const imagePath = readString(item.payload.image_path) ?? item.summary;
    return [imagePath, {
      imageKind: readString(item.payload.image_kind) ?? "image",
      scopeKind: readString(item.payload.scope_kind) ?? "scope",
      scopeName: readString(item.payload.scope_name) ?? "unknown",
      imagePath
    }];
  })).values()];
  const bundleEvaluated = (
    bundleScreenshotObservations.length > 0
    || result.diagnosticMeta.findings.some((item) => item.kind === "error_screenshot_available")
    || result.diagnosticMeta.missingEvidence.some((item) => item.id.includes("filesystem:image"))
  );

  const lines = [
    `- Bundle Screenshot Presence: ${bundleEvaluated ? "evaluated" : "not evaluated"}`,
    `- Bundle Screenshot Files: ${bundleEvaluated ? bundlePaths.length : "unknown"}`,
    `- MLA-Matched Screenshots For Current Scope: ${matchedItems.length}`
  ];

  if (!bundleEvaluated) {
    lines.push("- Interpretation: filesystem source was not included, so the report cannot say whether the bundle retained screenshot files.");
  }
  else if (bundlePaths.length > 0 && matchedItems.length === 0) {
    lines.push("- Interpretation: screenshot files exist in the bundle, but MLA did not match any of them to the current focused task/node scope.");
  }
  else if (matchedItems.length > 0) {
    lines.push("- Interpretation: use MLA-matched screenshots as current-scope evidence; treat other bundle screenshots as historical or unrelated until linked.");
  }
  else {
    lines.push("- Interpretation: no screenshot files were found for the analyzed bundle scope.");
  }

  for (const item of matchedItems.slice(0, 5)) {
    lines.push(`- Matched Screenshot [${item.imageKind}] ${item.scopeKind} ${item.scopeName}: ${item.imagePath}`);
  }

  if (matchedItems.length > 5) {
    lines.push(`- Matched Screenshot Entries Omitted: ${matchedItems.length - 5}`);
  }

  return lines.join("\n");
}

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
      content: renderSummaryLines(result)
    },
    {
      id: "task-semantics",
      title: "Task Semantics",
      content: renderTaskSemanticsLines()
    },
    {
      id: "screenshot-evidence",
      title: "Screenshot Evidence",
      content: renderScreenshotEvidenceLines(result)
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
