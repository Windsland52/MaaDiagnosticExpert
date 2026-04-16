import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import { ConfidenceSchema } from "../models/common.js";
import { FindingSchema } from "../models/finding.js";
import { ObservationSchema } from "../models/observation.js";
import { ReferenceSchema } from "../models/reference.js";

export const FilesystemFileCategorySchema = z.enum([
  "config",
  "image",
  "log",
  "archive",
  "other"
]);

export const FilesystemFileSummarySchema = z.object({
  rootPath: z.string().min(1),
  path: z.string().min(1),
  relativePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  extension: z.string().min(1).nullable().default(null),
  category: FilesystemFileCategorySchema,
  parser: z.enum(["json", "jsonc", "yaml", "text", "binary"]).nullable().default(null),
  topLevelKeys: z.array(z.string().min(1)).default([]),
  booleanFlags: z.record(z.string(), z.boolean()).default({}),
  hints: z.array(z.string().min(1)).default([])
});

export const FilesystemSnapshotSchema = z.object({
  rootPaths: z.array(z.string().min(1)).min(1),
  fileCount: z.number().int().nonnegative(),
  directoryCount: z.number().int().nonnegative(),
  configCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  logCount: z.number().int().nonnegative(),
  archiveCount: z.number().int().nonnegative(),
  truncated: z.boolean().default(false),
  omittedFileCount: z.number().int().nonnegative().default(0),
  files: z.array(FilesystemFileSummarySchema).default([])
});

export const FilesystemMethodSchema = z.enum(["scan_snapshot"]);

export const FilesystemEnvelopeSchema = z.object({
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

export const FilesystemToolResultSchema = z.object({
  tool: FilesystemMethodSchema,
  response: FilesystemEnvelopeSchema
});

export const FilesystemBatchInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  results: z.array(FilesystemToolResultSchema).min(1)
});

export type FilesystemFileCategory = z.infer<typeof FilesystemFileCategorySchema>;
export type FilesystemFileSummary = z.infer<typeof FilesystemFileSummarySchema>;
export type FilesystemSnapshot = z.infer<typeof FilesystemSnapshotSchema>;
export type FilesystemMethod = z.infer<typeof FilesystemMethodSchema>;
export type FilesystemEnvelope = z.infer<typeof FilesystemEnvelopeSchema>;
export type FilesystemToolResult = z.infer<typeof FilesystemToolResultSchema>;
export type FilesystemBatchInput = z.infer<typeof FilesystemBatchInputSchema>;

function buildCommonReferences(method: FilesystemMethod, response: FilesystemEnvelope) {
  return [
    ReferenceSchema.parse({
      kind: "tool_result",
      locator: `filesystem:${method}:${response.request_id}`,
      label: `${method} result`,
      sourceTool: "filesystem",
      meta: {
        api_version: response.api_version
      }
    })
  ];
}

function buildFileReference(path: string, label: string) {
  return ReferenceSchema.parse({
    kind: "source_file",
    locator: path,
    label,
    sourceTool: "filesystem",
    path
  });
}

function buildImageReference(path: string, label: string) {
  return ReferenceSchema.parse({
    kind: "image",
    locator: path,
    label,
    sourceTool: "filesystem",
    path
  });
}

function buildSnapshotObservations(result: FilesystemToolResult) {
  const { tool, response } = result;
  const references = buildCommonReferences(tool, response);
  const observations = [];

  if (!response.ok || !response.data) {
    observations.push(ObservationSchema.parse({
      id: `obs:${tool}:${response.request_id}:error`,
      kind: "tool_error",
      summary: `Filesystem ${tool} failed: ${response.error?.message ?? "unknown error"}`,
      sourceTool: "filesystem",
      severity: "error",
      payload: {
        code: response.error?.code,
        retryable: response.error?.retryable ?? false
      },
      references
    }));
    return observations;
  }

  const snapshot = FilesystemSnapshotSchema.parse(response.data);

  observations.push(ObservationSchema.parse({
    id: `obs:${tool}:${response.request_id}:summary`,
    kind: "filesystem_snapshot",
    summary: `Scanned ${snapshot.fileCount} files under ${snapshot.rootPaths.length} roots, found ${snapshot.configCount} config files and ${snapshot.imageCount} images`,
    sourceTool: "filesystem",
    payload: {
      root_paths: snapshot.rootPaths,
      file_count: snapshot.fileCount,
      directory_count: snapshot.directoryCount,
      config_count: snapshot.configCount,
      image_count: snapshot.imageCount,
      log_count: snapshot.logCount,
      archive_count: snapshot.archiveCount,
      truncated: snapshot.truncated,
      omitted_file_count: snapshot.omittedFileCount
    },
    references: [
      ...references,
      ...snapshot.rootPaths.slice(0, 3).map((rootPath) => buildFileReference(rootPath, "scan root"))
    ]
  }));

  for (const file of snapshot.files.filter((item) => item.category === "config")) {
    observations.push(ObservationSchema.parse({
      id: `obs:${tool}:${response.request_id}:config:${file.path}`,
      kind: "config_snapshot",
      summary: `Found config snapshot ${file.relativePath} with ${file.topLevelKeys.length} top-level keys`,
      sourceTool: "filesystem",
      payload: {
        path: file.path,
        relative_path: file.relativePath,
        parser: file.parser,
        top_level_keys: file.topLevelKeys,
        boolean_flags: file.booleanFlags,
        hints: file.hints
      },
      references: [
        ...references,
        buildFileReference(file.path, file.relativePath)
      ]
    }));

    for (const [flagName, flagValue] of Object.entries(file.booleanFlags)) {
      observations.push(ObservationSchema.parse({
        id: `obs:${tool}:${response.request_id}:flag:${file.path}:${flagName}`,
        kind: "config_flag",
        summary: `Config ${file.relativePath} sets ${flagName}=${flagValue}`,
        sourceTool: "filesystem",
        payload: {
          path: file.path,
          relative_path: file.relativePath,
          flag: flagName,
          value: flagValue
        },
        references: [
          ...references,
          buildFileReference(file.path, file.relativePath)
        ]
      }));
    }
  }

  for (const file of snapshot.files.filter((item) => item.category === "image")) {
    observations.push(ObservationSchema.parse({
      id: `obs:${tool}:${response.request_id}:image:${file.path}`,
      kind: "error_screenshot",
      summary: `Found screenshot evidence ${file.relativePath}`,
      sourceTool: "filesystem",
      payload: {
        path: file.path,
        relative_path: file.relativePath,
        size_bytes: file.sizeBytes
      },
      references: [
        ...references,
        buildImageReference(file.path, file.relativePath)
      ]
    }));
  }

  return observations;
}

export function buildFilesystemFindings(results: FilesystemToolResult[]) {
  const findings = [];
  const missingEvidence = [];

  for (const result of results) {
    if (!result.response.ok || !result.response.data) {
      continue;
    }

    const snapshot = FilesystemSnapshotSchema.parse(result.response.data);
    const basisObservationId = `obs:scan_snapshot:${result.response.request_id}:summary`;
    const references = buildCommonReferences("scan_snapshot", result.response);

    if (snapshot.fileCount === 0) {
      missingEvidence.push({
        id: `missing:filesystem:no-files:${result.response.request_id}`,
        description: "Filesystem scan did not discover any files under the provided roots.",
        priority: "high" as const,
        suggestedActions: [
          "Verify that the provided root paths exist and are readable.",
          "Broaden the include globs for the filesystem scan."
        ]
      });
      continue;
    }

    if (snapshot.configCount > 0) {
      findings.push(FindingSchema.parse({
        id: `finding:filesystem:config:${result.response.request_id}`,
        kind: "config_snapshot_available",
        statement: `Filesystem scan found ${snapshot.configCount} config files`,
        status: "confirmed",
        confidence: ConfidenceSchema.parse("high"),
        basisObservationIds: [basisObservationId],
        supportingReferences: references,
        gaps: [],
        tags: ["filesystem", "config"]
      }));
    }
    else {
      missingEvidence.push({
        id: `missing:filesystem:config:${result.response.request_id}`,
        description: "No config snapshot files were found under the scanned roots.",
        priority: "medium" as const,
        suggestedActions: [
          "Check whether the exported log bundle includes the config directory.",
          "Pass the project or log root that contains config snapshots."
        ]
      });
    }

    if (snapshot.imageCount > 0) {
      findings.push(FindingSchema.parse({
        id: `finding:filesystem:image:${result.response.request_id}`,
        kind: "error_screenshot_available",
        statement: `Filesystem scan found ${snapshot.imageCount} screenshot evidence files`,
        status: "confirmed",
        confidence: ConfidenceSchema.parse("high"),
        basisObservationIds: [basisObservationId],
        supportingReferences: references,
        gaps: [],
        tags: ["filesystem", "image"]
      }));
    }
    else {
      missingEvidence.push({
        id: `missing:filesystem:image:${result.response.request_id}`,
        description: "No screenshot evidence files were found under the scanned roots.",
        priority: "low" as const,
        suggestedActions: [
          "Check whether save_on_error was enabled during the failing run.",
          "Verify that the exported log bundle retained the on_error directory."
        ]
      });
    }

    for (const file of snapshot.files.filter((item) => Object.keys(item.booleanFlags).length > 0)) {
      for (const [flagName, flagValue] of Object.entries(file.booleanFlags)) {
        findings.push(FindingSchema.parse({
          id: `finding:filesystem:flag:${result.response.request_id}:${file.path}:${flagName}`,
          kind: "config_flag_detected",
          statement: `Config ${file.relativePath} sets ${flagName}=${flagValue}`,
          status: "confirmed",
          confidence: ConfidenceSchema.parse("high"),
          basisObservationIds: [
            `obs:scan_snapshot:${result.response.request_id}:flag:${file.path}:${flagName}`
          ],
          supportingReferences: [
            ...references,
            buildFileReference(file.path, file.relativePath)
          ],
          gaps: [],
          tags: ["filesystem", "config", flagName]
        }));
      }
    }

    if (snapshot.truncated) {
      missingEvidence.push({
        id: `missing:filesystem:truncated:${result.response.request_id}`,
        description: `Filesystem scan stopped after the max file limit and omitted ${snapshot.omittedFileCount} files.`,
        priority: "medium" as const,
        suggestedActions: [
          "Increase maxFiles for the filesystem runtime input.",
          "Restrict roots or include globs to the relevant directories."
        ]
      });
    }
  }

  return { findings, missingEvidence };
}

export function normalizeFilesystemResults(input: FilesystemBatchInput): AdapterRunOutput {
  const normalized = FilesystemBatchInputSchema.parse(input);
  const observations = normalized.results.flatMap(buildSnapshotObservations);
  const { findings, missingEvidence } = buildFilesystemFindings(normalized.results);

  return {
    toolName: "filesystem",
    rawResult: normalized.results,
    observations,
    findings,
    missingEvidence,
    profileHints: [
      {
        kind: "recommended_tool",
        value: "filesystem",
        reason: "Use deterministic file evidence to confirm config snapshots and screenshots."
      }
    ]
  };
}

export const filesystemResultAdapter: ToolAdapter<FilesystemBatchInput> = {
  id: "filesystem-result",

  normalize(input) {
    return normalizeFilesystemResults(input);
  }
};

export const filesystemAdapter = filesystemResultAdapter;
