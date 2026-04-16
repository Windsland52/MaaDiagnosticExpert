import type { AdapterRunOutput } from "./adapters/types.js";
import {
  normalizeFilesystemResults,
  normalizeFilesystemRuntimeInput,
  normalizeMaaLogAnalyzerResults,
  normalizeMaaLogAnalyzerRuntimeInput,
  normalizeMaaSupportExtensionResults,
  normalizeMaaSupportExtensionRuntimeInput,
  type MaaSupportExtensionRuntimeInput
} from "./adapters/index.js";
import { ConfidenceSchema } from "./models/common.js";
import { FindingSchema } from "./models/finding.js";
import {
  DiagnosticPipelineInputSchema,
  type DiagnosticPipelineInput
} from "./models/diagnostic-pipeline.js";
import { MissingEvidenceSchema, ProfileHintSchema, type RetrievalHit } from "./models/retrieval.js";
import type { CoreResult } from "./models/core-result.js";
import { resolveProfile } from "./profiles/loader.js";
import { searchLocalCorpora } from "./retrieval/local.js";
import { mergeAdapterOutputs } from "./results.js";

type PipelineOptions = {
  withReport?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const normalized = readString(item);
    return normalized ? [normalized] : [];
  });
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.length > 0)))];
}

function dedupeProfileHints(result: CoreResult): void {
  const seen = new Set<string>();
  result.diagnosticMeta.profileHints = result.diagnosticMeta.profileHints.filter((hint) => {
    const key = `${hint.kind}:${hint.value}:${hint.reason ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeMissingEvidence(result: CoreResult): void {
  const seen = new Set<string>();
  result.diagnosticMeta.missingEvidence = result.diagnosticMeta.missingEvidence.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function dedupeFindings(result: CoreResult): void {
  const seen = new Set<string>();
  result.diagnosticMeta.findings = result.diagnosticMeta.findings.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function dedupeRetrievalHits(hits: RetrievalHit[]): RetrievalHit[] {
  const byId = new Map<string, RetrievalHit>();

  for (const hit of hits) {
    const existing = byId.get(hit.id);
    if (!existing || hit.score > existing.score) {
      byId.set(hit.id, hit);
    }
  }

  return [...byId.values()].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.corpus !== right.corpus) {
      return left.corpus.localeCompare(right.corpus);
    }

    return left.path.localeCompare(right.path);
  });
}

function addProfileHints(result: CoreResult, profileId: string | null): void {
  if (!profileId) {
    return;
  }

  const profile = resolveProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }

  result.diagnosticMeta.profileHints.push(
    ...profile.recommendedTools.map((value) => ProfileHintSchema.parse({
      kind: "recommended_tool",
      value,
      reason: "Recommended by the selected profile."
    })),
    ...profile.recommendedCorpora.map((value) => ProfileHintSchema.parse({
      kind: "recommended_corpus",
      value,
      reason: "Recommended by the selected profile."
    })),
    ...profile.recommendedQueries.map((value) => ProfileHintSchema.parse({
      kind: "recommended_query",
      value,
      reason: "Recommended by the selected profile."
    })),
    ...profile.notes.map((value) => ProfileHintSchema.parse({
      kind: "note",
      value
    }))
  );

  dedupeProfileHints(result);
}

function extractMlaQueryCandidates(output: AdapterRunOutput | null): {
  taskQueries: string[];
  nodeQueries: string[];
} {
  if (!output) {
    return {
      taskQueries: [],
      nodeQueries: []
    };
  }

  const taskQueries: string[] = [];
  const nodeQueries: string[] = [];

  for (const observation of output.observations ?? []) {
    if (observation.kind === "task_overview" && isRecord(observation.payload)) {
      const task = isRecord(observation.payload.task) ? observation.payload.task : null;
      const entry = readString(task?.entry);
      if (entry) {
        taskQueries.push(entry);
        nodeQueries.push(entry);
      }
    }

    if (observation.kind === "node_timeline" && isRecord(observation.payload)) {
      const timeline = Array.isArray(observation.payload.timeline) ? observation.payload.timeline : [];
      for (const item of timeline.slice(0, 3)) {
        if (!isRecord(item)) {
          continue;
        }
        const name = readString(item.name);
        if (name) {
          nodeQueries.push(name);
        }
      }
    }

    if (observation.kind === "parent_chain" && isRecord(observation.payload)) {
      const chain = Array.isArray(observation.payload.chain) ? observation.payload.chain : [];
      for (const item of chain.slice(0, 5)) {
        if (!isRecord(item)) {
          continue;
        }
        const name = readString(item.name);
        if (name) {
          nodeQueries.push(name);
        }
      }
    }
  }

  return {
    taskQueries: uniqueStrings(taskQueries),
    nodeQueries: uniqueStrings(nodeQueries)
  };
}

function enrichMseRuntimeInput(
  input: MaaSupportExtensionRuntimeInput,
  mlaOutput: AdapterRunOutput | null
): MaaSupportExtensionRuntimeInput {
  const candidates = extractMlaQueryCandidates(mlaOutput);
  const taskDefinitions = uniqueStrings([
    ...input.queries.task_definitions,
    ...candidates.taskQueries
  ]);
  const nodeDefinitions = uniqueStrings([
    ...input.queries.node_definitions,
    ...candidates.nodeQueries
  ]);

  return {
    ...input,
    queries: {
      ...input.queries,
      task_definitions: taskDefinitions,
      node_definitions: nodeDefinitions
    }
  };
}

function resolveEffectiveProfileId(input: DiagnosticPipelineInput): string | null {
  return input.profileId
    ?? input.mla?.input.profileId
    ?? input.filesystem?.input.profileId
    ?? input.mse?.input.profileId
    ?? null;
}

async function runFilesystemSource(
  input: DiagnosticPipelineInput["filesystem"]
): Promise<AdapterRunOutput | null> {
  if (!input) {
    return null;
  }

  if (input.mode === "runtime") {
    return normalizeFilesystemRuntimeInput(input.input);
  }

  return normalizeFilesystemResults(input.input);
}

async function runMlaSource(input: DiagnosticPipelineInput["mla"]): Promise<AdapterRunOutput | null> {
  if (!input) {
    return null;
  }

  if (input.mode === "runtime") {
    return normalizeMaaLogAnalyzerRuntimeInput(input.input);
  }

  return normalizeMaaLogAnalyzerResults(input.input);
}

async function runMseSource(
  input: DiagnosticPipelineInput["mse"],
  mlaOutput: AdapterRunOutput | null
): Promise<AdapterRunOutput | null> {
  if (!input) {
    return null;
  }

  if (input.mode === "runtime") {
    return normalizeMaaSupportExtensionRuntimeInput(enrichMseRuntimeInput(input.input, mlaOutput));
  }

  return normalizeMaaSupportExtensionResults(input.input);
}

function findObservationByKind(result: CoreResult, kind: string) {
  return result.diagnosticMeta.observations.filter((item) => item.kind === kind);
}

function buildDerivedQueries(result: CoreResult, profileId: string | null, input: DiagnosticPipelineInput): string[] {
  const profile = profileId ? resolveProfile(profileId) : null;
  const queries = new Set<string>([
    ...input.retrieval.queryHints,
    ...(profile?.recommendedQueries ?? [])
  ]);

  for (const observation of findObservationByKind(result, "task_overview")) {
    if (!isRecord(observation.payload)) {
      continue;
    }
    const task = isRecord(observation.payload.task) ? observation.payload.task : null;
    const entry = readString(task?.entry);
    if (!entry) {
      continue;
    }

    queries.add(entry);
    queries.add(`${entry} next on_error timeout`);
    queries.add(`${entry} pipeline option`);
  }

  for (const observation of findObservationByKind(result, "maa_project_summary")) {
    if (!isRecord(observation.payload)) {
      continue;
    }

    const controllers = readStringArray(observation.payload.controller_names);
    const resources = readStringArray(observation.payload.resource_names);

    queries.add("interface.json task option");
    queries.add("controller resource pipeline");

    for (const controller of controllers.slice(0, 2)) {
      queries.add(`${controller} controller`);
    }

    for (const resource of resources.slice(0, 2)) {
      queries.add(`${resource} resource pipeline`);
    }
  }

  if (result.diagnosticMeta.findings.some((item) => item.kind === "maa_project_definition_errors")) {
    queries.add("interface.json import task option pipeline");
  }

  for (const observation of findObservationByKind(result, "config_flag")) {
    if (!isRecord(observation.payload)) {
      continue;
    }

    const flagName = readString(observation.payload.flag);
    const flagValue = observation.payload.value;
    if (!flagName || typeof flagValue !== "boolean") {
      continue;
    }

    queries.add(`${flagName} ${flagValue}`);
    queries.add(`${flagName} on_error`);
  }

  return [...queries].filter((item) => item.trim().length > 0);
}

async function collectRetrievalHits(
  result: CoreResult,
  profileId: string | null,
  input: DiagnosticPipelineInput
): Promise<{ queries: string[]; corpusIds: string[]; hits: RetrievalHit[] }> {
  if (!input.retrieval.enabled) {
    return {
      queries: [],
      corpusIds: [],
      hits: []
    };
  }

  const profile = profileId ? resolveProfile(profileId) : null;
  const corpusIds = uniqueStrings([
    ...input.retrieval.corpusIds,
    ...(profile?.recommendedCorpora ?? [])
  ]);
  const queries = buildDerivedQueries(result, profileId, input);
  const hits: RetrievalHit[] = [];

  for (const query of queries) {
    const response = await searchLocalCorpora({
      apiVersion: "retrieval-query/v1",
      query,
      corpusIds,
      limit: input.retrieval.limitPerQuery
    });
    hits.push(...response.hits);
  }

  return {
    queries,
    corpusIds,
    hits: dedupeRetrievalHits(hits).slice(0, input.retrieval.maxHits)
  };
}

function applyPipelineRules(result: CoreResult, hasMseSource: boolean): void {
  const taskObservations = findObservationByKind(result, "task_overview");
  const taskDefinitionObservations = findObservationByKind(result, "maa_task_definition");
  const nodeDefinitionObservations = findObservationByKind(result, "maa_node_definition");

  for (const observation of taskObservations) {
    if (!isRecord(observation.payload)) {
      continue;
    }

    const task = isRecord(observation.payload.task) ? observation.payload.task : null;
    const taskName = readString(task?.entry);
    if (!taskName) {
      continue;
    }

    const taskDefinition = taskDefinitionObservations.find((item) => {
      if (!isRecord(item.payload)) {
        return false;
      }
      return readString(item.payload.name) === taskName;
    });

    if (taskDefinition) {
      result.diagnosticMeta.findings.push(FindingSchema.parse({
        id: `finding:diagnostic-pipeline:task-definition:${taskName}`,
        kind: "task_definition_resolved",
        statement: `Task ${taskName} was resolved to a local Maa project definition`,
        status: "confirmed",
        confidence: ConfidenceSchema.parse("high"),
        basisObservationIds: [observation.id, taskDefinition.id],
        supportingReferences: [
          ...observation.references,
          ...taskDefinition.references
        ],
        gaps: [],
        tags: ["diagnostic-pipeline", "maa-support-extension"]
      }));

      const taskEntryNode = isRecord(taskDefinition.payload)
        ? readString(taskDefinition.payload.entry)
        : null;
      if (taskEntryNode) {
        const nodeDefinition = nodeDefinitionObservations.find((item) => {
          if (!isRecord(item.payload)) {
            return false;
          }
          return readString(item.payload.name) === taskEntryNode;
        });

        if (nodeDefinition) {
          result.diagnosticMeta.findings.push(FindingSchema.parse({
            id: `finding:diagnostic-pipeline:entry-node:${taskName}:${taskEntryNode}`,
            kind: "entry_node_resolved",
            statement: `Task ${taskName} entry node ${taskEntryNode} was resolved to a local pipeline definition`,
            status: "confirmed",
            confidence: ConfidenceSchema.parse("high"),
            basisObservationIds: [observation.id, taskDefinition.id, nodeDefinition.id],
            supportingReferences: [
              ...taskDefinition.references,
              ...nodeDefinition.references
            ],
            gaps: [],
            tags: ["diagnostic-pipeline", "maa-support-extension", "pipeline"]
          }));
        }
        else if (hasMseSource) {
          result.diagnosticMeta.missingEvidence.push(MissingEvidenceSchema.parse({
            id: `missing:diagnostic-pipeline:entry-node:${taskEntryNode}`,
            description: `The Maa project entry node ${taskEntryNode} was not resolved from local pipeline files.`,
            priority: "medium",
            suggestedActions: [
              "Verify that the project root contains the active pipeline files.",
              "Add a node definition query for the missing entry node."
            ]
          }));
        }
      }
    }
    else if (hasMseSource) {
      result.diagnosticMeta.missingEvidence.push(MissingEvidenceSchema.parse({
        id: `missing:diagnostic-pipeline:task-definition:${taskName}`,
        description: `The Maa project task definition for ${taskName} was not resolved from local project files.`,
        priority: "high",
        suggestedActions: [
          "Verify that the interface import list includes the relevant task file.",
          "Check whether the provided project root matches the logs under analysis."
        ]
      }));
    }
  }

  dedupeFindings(result);
  dedupeMissingEvidence(result);
}

export async function runDiagnosticPipeline(
  input: DiagnosticPipelineInput,
  options: PipelineOptions = {}
): Promise<CoreResult> {
  const normalized = DiagnosticPipelineInputSchema.parse(input);
  const effectiveProfileId = resolveEffectiveProfileId(normalized);
  const outputs: AdapterRunOutput[] = [];
  const filesystemOutput = await runFilesystemSource(normalized.filesystem);
  if (filesystemOutput) {
    outputs.push(filesystemOutput);
  }

  const mlaOutput = await runMlaSource(normalized.mla);
  if (mlaOutput) {
    outputs.push(mlaOutput);
  }

  const mseOutput = await runMseSource(normalized.mse, mlaOutput);
  if (mseOutput) {
    outputs.push(mseOutput);
  }

  const result = mergeAdapterOutputs(outputs, effectiveProfileId);
  addProfileHints(result, effectiveProfileId);

  const retrieval = await collectRetrievalHits(result, effectiveProfileId, normalized);
  result.diagnosticMeta.retrievalHits = dedupeRetrievalHits([
    ...result.diagnosticMeta.retrievalHits,
    ...retrieval.hits
  ]);

  if (normalized.retrieval.enabled && result.diagnosticMeta.retrievalHits.length === 0) {
    result.diagnosticMeta.missingEvidence.push(MissingEvidenceSchema.parse({
      id: "missing:diagnostic-pipeline:retrieval",
      description: "No local documentation hits were retrieved for the derived diagnostic queries.",
      priority: "low",
      suggestedActions: [
        "Prepare builtin corpora before searching local documentation.",
        "Add more specific retrieval query hints for the current issue."
      ]
    }));
  }

  applyPipelineRules(result, Boolean(normalized.mse));

  result.rawToolResults["diagnostic-pipeline"] = {
    apiVersion: "diagnostic-pipeline-runtime/v1",
    profileId: effectiveProfileId,
    retrieval: {
      enabled: normalized.retrieval.enabled,
      corpusIds: retrieval.corpusIds,
      queries: retrieval.queries,
      hitCount: result.diagnosticMeta.retrievalHits.length
    },
    sources: {
      mla: normalized.mla?.mode ?? null,
      filesystem: normalized.filesystem?.mode ?? null,
      mse: normalized.mse?.mode ?? null
    }
  };

  if (options.withReport) {
    const { buildMarkdownReport } = await import("./renderers/markdown.js");
    result.report = buildMarkdownReport(result);
  }

  return result;
}
