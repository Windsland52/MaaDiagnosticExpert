import path from "node:path";

import {
  type ParseLogBundleInput,
  type ResolvedLogSourceInput,
  type GetNextListHistoryArgs,
  type GetNodeTimelineArgs,
  type GetParentChainArgs,
  type GetRawLinesArgs,
  type GetTaskOverviewArgs
} from "@windsland52/maa-log-parser";
import fg from "fast-glob";
import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import { loadMlaRuntimeDependencies } from "./mla-runtime-deps.js";
import {
  MaaLogAnalyzerEnvelopeSchema,
  MaaLogAnalyzerMethodSchema,
  type MaaLogAnalyzerMethod,
  normalizeMaaLogAnalyzerResults
} from "./maa-log-analyzer.js";

const RuntimeInputFocusSchema = z.object({
  keywords: z.array(z.string().min(1)).default([]),
  started_after: z.string().min(1).optional(),
  started_before: z.string().min(1).optional()
}).refine((input) => {
  return input.keywords.length > 0 || Boolean(input.started_after) || Boolean(input.started_before);
}, {
  message: "focus requires at least one keyword or time boundary.",
  path: ["keywords"]
});

const RuntimeInputEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["file", "folder", "zip"]),
  focus: RuntimeInputFocusSchema.optional(),
  include_globs: z.array(z.string().min(1)).optional(),
  exclude_globs: z.array(z.string().min(1)).optional(),
  include_history_logs: z.boolean().optional(),
  follow_symlinks: z.boolean().optional(),
  max_files: z.number().int().positive().max(200).optional()
});

const RuntimeQueryTaskOverviewSchema = z.object({
  task_id: z.number().int().optional()
});

const RuntimeQueryNodeTimelineSchema = z.object({
  task_id: z.number().int(),
  node_id: z.number().int(),
  scope_id: z.string().min(1).optional(),
  occurrence_index: z.number().int().positive().optional(),
  limit: z.number().int().nonnegative().optional()
});

const RuntimeQueryNextListHistorySchema = RuntimeQueryNodeTimelineSchema;
const RuntimeQueryParentChainSchema = RuntimeQueryNodeTimelineSchema.omit({ limit: true });

const RuntimeQueryRawLinesSchema = z.object({
  task_id: z.number().int(),
  source_key: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  line_start: z.number().int().positive().optional(),
  line_end: z.number().int().positive().optional(),
  limit: z.number().int().nonnegative().optional()
});

export const MaaLogAnalyzerRuntimeInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  session_id: z.string().min(1),
  inputs: z.array(RuntimeInputEntrySchema).min(1),
  queries: z.object({
    task_overview: RuntimeQueryTaskOverviewSchema.optional(),
    node_timeline: RuntimeQueryNodeTimelineSchema.optional(),
    next_list_history: RuntimeQueryNextListHistorySchema.optional(),
    parent_chain: RuntimeQueryParentChainSchema.optional(),
    raw_lines: RuntimeQueryRawLinesSchema.optional()
  }).default({})
});

export type MaaLogAnalyzerRuntimeInput = z.infer<typeof MaaLogAnalyzerRuntimeInputSchema>;

type RuntimeToolCall<TArgs> = {
  method: MaaLogAnalyzerMethod;
  args: TArgs;
};

const DEFAULT_PRIMARY_LOG_GLOBS = [
  "**/maafw.log",
  "**/maa.log"
];

const DEFAULT_HISTORY_LOG_GLOBS = [
  "**/maafw.bak.log",
  "**/maa.bak.log",
  "**/maafw.bak.*.log",
  "**/maa.bak.*.log"
];

const DEFAULT_FOCUSED_LOG_GLOBS = [
  ...DEFAULT_PRIMARY_LOG_GLOBS,
  ...DEFAULT_HISTORY_LOG_GLOBS
];

const DEFAULT_FOLDER_IGNORE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.venv/**",
  "**/dist/**",
  "**/build/**",
  "**/.pnpm-store/**"
];

function rankFolderLogPath(filePath: string): number {
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === "maafw.bak.log" || baseName.startsWith("maafw.bak.")) {
    return 0;
  }
  if (baseName === "maa.bak.log" || baseName.startsWith("maa.bak.")) {
    return 1;
  }
  if (baseName === "maafw.log") {
    return 2;
  }
  if (baseName === "maa.log") {
    return 3;
  }
  return 10;
}

function sortFolderLogPaths(paths: string[]): string[] {
  return [...paths].sort((left, right) => {
    const rankDiff = rankFolderLogPath(left) - rankFolderLogPath(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.localeCompare(right);
  });
}

function normalizeTimestampBoundary(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.includes(".") ? trimmed : `${trimmed}.000`;
}

function extractTimestamps(content: string): string[] {
  const matches = content.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]/g) ?? [];
  return matches.map((item) => item.slice(1, -1)).map((item) => normalizeTimestampBoundary(item) ?? item);
}

function contentMatchesFocus(
  content: string,
  focus: z.infer<typeof RuntimeInputFocusSchema>
): boolean {
  const keywords = focus.keywords;
  if (keywords.length > 0 && !keywords.some((keyword) => content.includes(keyword))) {
    return false;
  }

  const startedAfter = normalizeTimestampBoundary(focus.started_after);
  const startedBefore = normalizeTimestampBoundary(focus.started_before);
  if (!startedAfter && !startedBefore) {
    return true;
  }

  return extractTimestamps(content).some((timestamp) => {
    if (startedAfter && timestamp < startedAfter) {
      return false;
    }
    if (startedBefore && timestamp > startedBefore) {
      return false;
    }
    return true;
  });
}

async function expandFolderInput(
  input: z.infer<typeof RuntimeInputEntrySchema>,
  readNodeTextFileContent: (filePath: string) => Promise<string>
) {
  const folderPath = path.resolve(input.path);
  const baseIncludeGlobs = input.include_globs && input.include_globs.length > 0
    ? input.include_globs
    : (
      input.focus
        ? DEFAULT_FOCUSED_LOG_GLOBS
        : [
          ...DEFAULT_PRIMARY_LOG_GLOBS,
          ...(input.include_history_logs ? DEFAULT_HISTORY_LOG_GLOBS : [])
        ]
    );
  let matchedPaths = sortFolderLogPaths(await fg(baseIncludeGlobs, {
    cwd: folderPath,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: input.follow_symlinks ?? true,
    suppressErrors: true,
    ignore: [
      ...DEFAULT_FOLDER_IGNORE_GLOBS,
      ...(input.exclude_globs ?? [])
    ]
  }));

  if (
    matchedPaths.length === 0
    && !input.include_globs
    && !input.focus
    && !input.include_history_logs
  ) {
    matchedPaths = sortFolderLogPaths(await fg(DEFAULT_HISTORY_LOG_GLOBS, {
      cwd: folderPath,
      absolute: true,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: input.follow_symlinks ?? true,
      suppressErrors: true,
      ignore: [
        ...DEFAULT_FOLDER_IGNORE_GLOBS,
        ...(input.exclude_globs ?? [])
      ]
    }));
  }

  matchedPaths = matchedPaths.slice(0, input.max_files ?? 20);

  if (matchedPaths.length === 0) {
    return null;
  }

  const focusedEntries = [];
  for (const matchedPath of matchedPaths) {
    const content = await readNodeTextFileContent(matchedPath);
    if (input.focus && !contentMatchesFocus(content, input.focus)) {
      continue;
    }

    focusedEntries.push({
      content,
      source_key: matchedPath,
      source_path: matchedPath
    });
  }

  if (focusedEntries.length === 0) {
    if (input.focus) {
      throw new Error(`No log files under ${folderPath} matched the provided focus filters.`);
    }
    return null;
  }

  return focusedEntries.slice(0, input.max_files ?? 20);
}

async function resolveLocalInput(input: z.infer<typeof RuntimeInputEntrySchema>) {
  const dependencies = await loadMlaRuntimeDependencies();

  switch (input.kind) {
    case "file": {
      const content = await dependencies.readNodeTextFileContent(input.path);
      return {
        content,
        source_key: input.path,
        source_path: input.path
      };
    }

    case "folder": {
      if (
        input.include_globs?.length
        || input.exclude_globs?.length
        || input.include_history_logs
        || input.follow_symlinks === false
        || input.max_files
        || (input.focus && !dependencies.source.startsWith("local:"))
      ) {
        return expandFolderInput(input, dependencies.readNodeTextFileContent);
      }

      const extracted = await dependencies.loadNodeLogDirectory(
        input.path,
        input.focus
          ? {
            focus: input.focus
          }
          : undefined
      );
      if (!extracted) {
        return null;
      }
      return {
        content: extracted.content,
        source_key: input.path,
        source_path: input.path,
        error_images: extracted.errorImages,
        vision_images: extracted.visionImages,
        wait_freezes_images: extracted.waitFreezesImages
      };
    }

    case "zip": {
      const extracted = await dependencies.extractZipContentFromNodeFile(
        input.path,
        input.focus
          ? {
            focus: input.focus
          }
          : undefined
      );
      if (!extracted) {
        return null;
      }
      return {
        content: extracted.content,
        source_key: input.path,
        source_path: input.path,
        error_images: extracted.errorImages,
        vision_images: extracted.visionImages,
        wait_freezes_images: extracted.waitFreezesImages
      };
    }
  }
}

function createRuntimeCalls(input: MaaLogAnalyzerRuntimeInput): Array<RuntimeToolCall<unknown>> {
  const calls: Array<RuntimeToolCall<unknown>> = [
    {
      method: "parse_log_bundle",
      args: {
        session_id: input.session_id,
        inputs: input.inputs
      }
    }
  ];

  if (input.queries.task_overview) {
    calls.push({
      method: "get_task_overview",
      args: {
        session_id: input.session_id,
        ...input.queries.task_overview
      } satisfies GetTaskOverviewArgs
    });
  }

  if (input.queries.node_timeline) {
    calls.push({
      method: "get_node_timeline",
      args: {
        session_id: input.session_id,
        ...input.queries.node_timeline
      } satisfies GetNodeTimelineArgs
    });
  }

  if (input.queries.next_list_history) {
    calls.push({
      method: "get_next_list_history",
      args: {
        session_id: input.session_id,
        ...input.queries.next_list_history
      } satisfies GetNextListHistoryArgs
    });
  }

  if (input.queries.parent_chain) {
    calls.push({
      method: "get_parent_chain",
      args: {
        session_id: input.session_id,
        ...input.queries.parent_chain
      } satisfies GetParentChainArgs
    });
  }

  if (input.queries.raw_lines) {
    calls.push({
      method: "get_raw_lines",
      args: {
        session_id: input.session_id,
        ...input.queries.raw_lines
      } satisfies GetRawLinesArgs
    });
  }

  return calls;
}

async function runRuntimeCalls(input: MaaLogAnalyzerRuntimeInput) {
  const dependencies = await loadMlaRuntimeDependencies();
  const store = dependencies.createAnalyzerSessionStore();
  const handlers = dependencies.createAnalyzerToolHandlers({
    store,
    async resolve_input(entry: ParseLogBundleInput): Promise<ResolvedLogSourceInput | null> {
      return resolveLocalInput(entry);
    }
  });

  const outputs = [];
  const calls = createRuntimeCalls(input);

  for (const [index, call] of calls.entries()) {
    const response = await handlers[call.method](call.args as never);
    outputs.push({
      tool: MaaLogAnalyzerMethodSchema.parse(call.method),
      response: MaaLogAnalyzerEnvelopeSchema.parse({
        request_id: `runtime-${call.method}-${index + 1}`,
        api_version: "v1",
        ...response
      })
    });
  }

  return outputs;
}

export async function normalizeMaaLogAnalyzerRuntimeInput(
  input: MaaLogAnalyzerRuntimeInput
): Promise<AdapterRunOutput> {
  const normalized = MaaLogAnalyzerRuntimeInputSchema.parse(input);
  const results = await runRuntimeCalls(normalized);
  return normalizeMaaLogAnalyzerResults({
    profileId: normalized.profileId ?? null,
    results
  });
}

export const maaLogAnalyzerRuntimeAdapter: ToolAdapter<MaaLogAnalyzerRuntimeInput> = {
  id: "maa-log-analyzer-runtime",

  async normalize(input) {
    return normalizeMaaLogAnalyzerRuntimeInput(input);
  }
};
