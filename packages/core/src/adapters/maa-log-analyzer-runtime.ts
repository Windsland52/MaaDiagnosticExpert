import {
  createAnalyzerSessionStore,
  createAnalyzerToolHandlers,
  type ParseLogBundleInput,
  type ResolvedLogSourceInput,
  type GetNextListHistoryArgs,
  type GetNodeTimelineArgs,
  type GetParentChainArgs,
  type GetRawLinesArgs,
  type GetTaskOverviewArgs
} from "@windsland52/maa-log-parser";
import {
  extractZipContentFromNodeFile,
  loadNodeLogDirectory,
  readNodeTextFileContent
} from "@windsland52/maa-log-tools/node-input";
import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import {
  MaaLogAnalyzerEnvelopeSchema,
  MaaLogAnalyzerMethodSchema,
  type MaaLogAnalyzerMethod,
  normalizeMaaLogAnalyzerResults
} from "./maa-log-analyzer.js";

const RuntimeInputEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["file", "folder", "zip"])
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

async function resolveLocalInput(input: z.infer<typeof RuntimeInputEntrySchema>) {
  switch (input.kind) {
    case "file": {
      const content = await readNodeTextFileContent(input.path);
      return {
        content,
        source_key: input.path,
        source_path: input.path
      };
    }

    case "folder": {
      const extracted = await loadNodeLogDirectory(input.path);
      if (!extracted) {
        return null;
      }
      return {
        content: extracted.content,
        source_key: input.path,
        source_path: input.path
      };
    }

    case "zip": {
      const extracted = await extractZipContentFromNodeFile(input.path);
      if (!extracted) {
        return null;
      }
      return {
        content: extracted.content,
        source_key: input.path,
        source_path: input.path
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
  const store = createAnalyzerSessionStore();
  const handlers = createAnalyzerToolHandlers({
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
