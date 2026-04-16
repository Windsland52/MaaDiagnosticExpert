import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseJsonc, parseTree, type Node as JsonNode } from "jsonc-parser";
import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import {
  MaaSupportExtensionBatchInputSchema,
  MaaSupportExtensionDiagnosticSchema,
  MaaSupportExtensionDiagnosticResultSchema,
  MaaSupportExtensionEnvelopeSchema,
  MaaSupportExtensionMethodSchema,
  MaaSupportExtensionNodeDefinitionResultSchema,
  MaaSupportExtensionNodeDefinitionSchema,
  MaaSupportExtensionOptionDefinitionSchema,
  MaaSupportExtensionProjectSummarySchema,
  MaaSupportExtensionTaskDefinitionResultSchema,
  MaaSupportExtensionTaskDefinitionSchema,
  normalizeMaaSupportExtensionResults,
  type MaaSupportExtensionDiagnostic,
  type MaaSupportExtensionMethod,
  type MaaSupportExtensionNodeDefinition,
  type MaaSupportExtensionOptionDefinition,
  type MaaSupportExtensionProjectSummary,
  type MaaSupportExtensionTaskDefinition
} from "./maa-support-extension.js";

const RuntimeInputSchema = z.object({
  project_root: z.string().min(1),
  interface_file: z.string().min(1).optional()
});

export const MaaSupportExtensionRuntimeInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  project: RuntimeInputSchema,
  queries: z.object({
    task_definitions: z.array(z.string().min(1)).default([]),
    node_definitions: z.array(z.string().min(1)).default([]),
    diagnostics: z.boolean().default(true)
  }).default(() => ({
    task_definitions: [],
    node_definitions: [],
    diagnostics: true
  }))
});

export type MaaSupportExtensionRuntimeInput = z.infer<typeof MaaSupportExtensionRuntimeInputSchema>;

type LocatedFile = {
  absolutePath: string;
  relativePath: string;
};

type ParsedTaskFile = {
  tasks: MaaSupportExtensionTaskDefinition[];
  options: MaaSupportExtensionOptionDefinition[];
};

type ProjectSnapshot = MaaSupportExtensionProjectSummary & {
  nodes: MaaSupportExtensionNodeDefinition[];
  diagnostics: MaaSupportExtensionDiagnostic[];
};

type FilesystemAccessError = Error & {
  code?: unknown;
  path?: unknown;
  syscall?: unknown;
  coreCode?: unknown;
  retryable?: unknown;
  details?: unknown;
  meta?: unknown;
};

function toRepoRelative(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function lineFromOffset(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.length > 0)))];
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item));
  }
  return [];
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferResourceScope(relativePath: string): string | null {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes("/resource_adb/")) {
    return "adb";
  }
  if (normalized.includes("/resource_wlroots/")) {
    return "wlroots";
  }
  if (normalized.includes("/resource/")) {
    return "default";
  }
  return null;
}

function isPermissionDeniedError(error: unknown): error is FilesystemAccessError {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithAccessCode = error as FilesystemAccessError;
  return errorWithAccessCode.code === "EACCES" || errorWithAccessCode.code === "EPERM";
}

function buildFilesystemPermissionError(
  error: FilesystemAccessError,
  projectRoot: string
): FilesystemAccessError {
  const accessPath = typeof error.path === "string" && error.path.length > 0
    ? error.path
    : projectRoot;
  const syscall = typeof error.syscall === "string" && error.syscall.length > 0
    ? error.syscall
    : "filesystem";
  const hostHint = accessPath.startsWith("/mnt/") || projectRoot.startsWith("/mnt/")
    ? "wsl_windows_acl_mismatch"
    : "filesystem_acl_restriction";

  const wrapped = new Error(
    `Permission denied while reading Maa project files during ${syscall}: ${accessPath}`
  ) as FilesystemAccessError;

  wrapped.code = typeof error.code === "string" ? error.code : "EACCES";
  wrapped.coreCode = "io_error";
  wrapped.retryable = false;
  wrapped.details = [
    {
      path: ["project", "project_root"],
      message: `Permission denied during ${syscall} on ${accessPath}`,
      code: wrapped.code
    }
  ];
  wrapped.meta = {
    adapter: "maa-support-extension-runtime",
    category: "filesystem_permission",
    operation: syscall,
    path: accessPath,
    project_root: projectRoot,
    host_hint: hostHint,
    original_message: error.message,
    suggested_actions: [
      "Grant read and execute permission on the reported directory tree, then rerun the same command.",
      "If the project is under /mnt on WSL, fix Windows-side ACLs or copy the project into the Linux filesystem before rerunning.",
      "Check whether pipeline/resource directories or symlink targets were created on another OS account and are not readable from the current runtime."
    ]
  };

  return wrapped;
}

async function locateInterfaceFile(projectRoot: string, explicit?: string): Promise<LocatedFile> {
  const candidates = uniqueStrings([
    explicit,
    "interface.json",
    "interface.jsonc",
    "assets/interface.json",
    "assets/interface.jsonc",
    "install/interface.json",
    "install/interface.jsonc"
  ]);

  for (const candidate of candidates) {
    const absolutePath = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(projectRoot, candidate);
    try {
      await readFile(absolutePath, "utf8");
      return {
        absolutePath,
        relativePath: toRepoRelative(projectRoot, absolutePath)
      };
    }
    catch {
      continue;
    }
  }

  throw new Error(`Could not locate interface.json under ${projectRoot}`);
}

async function parseInterfaceFile(projectRoot: string, explicit?: string) {
  const located = await locateInterfaceFile(projectRoot, explicit);
  const content = await readFile(located.absolutePath, "utf8");
  const parsed = z.object({
    interface_version: z.number().int().optional(),
    name: z.string().optional(),
    controller: z.array(z.object({
      name: z.string().min(1)
    })).default([]),
    resource: z.array(z.object({
      name: z.string().min(1)
    })).default([]),
    task: z.array(z.record(z.string(), z.unknown())).default([]),
    option: z.record(z.string(), z.unknown()).default({}),
    import: z.array(z.string().min(1)).default([])
  }).parse(parseJsonc(content));

  return {
    located,
    parsed
  };
}

function parseTaskLine(content: string, root: JsonNode | undefined, index: number): number | undefined {
  const taskProp = root?.children?.find((child) => child.children?.[0]?.value === "task");
  const taskNode = taskProp?.children?.[1]?.children?.[index];
  if (!taskNode) {
    return undefined;
  }
  return lineFromOffset(content, taskNode.offset);
}

function parseOptionLine(content: string, root: JsonNode | undefined, optionName: string): number | undefined {
  const optionProp = root?.children?.find((child) => child.children?.[0]?.value === "option");
  const optionNode = optionProp?.children?.[1]?.children?.find(
    (child) => child.children?.[0]?.value === optionName
  );
  if (!optionNode) {
    return undefined;
  }
  return lineFromOffset(content, optionNode.offset);
}

async function parseTaskFile(projectRoot: string, absolutePath: string): Promise<ParsedTaskFile> {
  const content = await readFile(absolutePath, "utf8");
  const parsed = parseJsonc(content) as {
    task?: Array<Record<string, unknown>>;
    option?: Record<string, Record<string, unknown>>;
  };
  const root = parseTree(content);
  const sourceFile = toRepoRelative(projectRoot, absolutePath);

  const tasks = (parsed.task ?? []).map((task, index) => MaaSupportExtensionTaskDefinitionSchema.parse({
    name: task.name,
    entry: normalizeOptionalString(task.entry),
    label: normalizeOptionalString(task.label),
    description: normalizeOptionalString(task.description),
    groups: normalizeStringList(task.group),
    controllers: normalizeStringList(task.controller),
    resources: normalizeStringList(task.resource),
    optionIds: normalizeStringList(task.option),
    sourceFile,
    line: parseTaskLine(content, root ?? undefined, index)
  }));

  const options = Object.entries(parsed.option ?? {}).map(([name, option]) => {
    const cases = Array.isArray(option.cases) ? option.cases : [];
    const nestedOptionIds = cases.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }
      return normalizeStringList((item as Record<string, unknown>).option);
    });
    const overrideNodes = cases.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }
      const override = (item as Record<string, unknown>).pipeline_override;
      if (typeof override !== "object" || override === null) {
        return [];
      }
      return Object.keys(override);
    });

    return {
      name,
      type: normalizeOptionalString(option.type),
      label: normalizeOptionalString(option.label),
      description: normalizeOptionalString(option.description),
      controllers: normalizeStringList(option.controller),
      resources: normalizeStringList(option.resource),
      caseNames: cases
        .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>).name : null))
        .filter((value): value is string => typeof value === "string"),
      nestedOptionIds: uniqueStrings(nestedOptionIds),
      overrideNodes: uniqueStrings(overrideNodes),
      sourceFile,
      line: parseOptionLine(content, root ?? undefined, name)
    };
  }).map((item) => MaaSupportExtensionOptionDefinitionSchema.parse(item));

  return { tasks, options };
}

function parseNodeLine(content: string, root: JsonNode | undefined, nodeName: string): number | undefined {
  const node = root?.children?.find((child) => child.children?.[0]?.value === nodeName);
  if (!node) {
    return undefined;
  }
  return lineFromOffset(content, node.offset);
}

async function parsePipelineFile(projectRoot: string, absolutePath: string): Promise<MaaSupportExtensionNodeDefinition[]> {
  const content = await readFile(absolutePath, "utf8");
  const parsed = parseJsonc(content) as Record<string, Record<string, unknown>>;
  const root = parseTree(content);
  const sourceFile = toRepoRelative(projectRoot, absolutePath);
  const resourceScope = inferResourceScope(sourceFile);

  return Object.entries(parsed ?? {}).map(([name, node]) => MaaSupportExtensionNodeDefinitionSchema.parse({
    name,
    sourceFile,
    line: parseNodeLine(content, root ?? undefined, name),
    resourceScope,
    next: uniqueStrings(normalizeStringList(node?.next)),
    onError: uniqueStrings(normalizeStringList(node?.on_error)),
    enabled: typeof node?.enabled === "boolean" ? node.enabled : null,
    recognizedKeys: Object.keys(node ?? {})
  }));
}

async function collectTaskFiles(projectRoot: string, interfaceRelativePath: string, imports: string[]) {
  const interfaceDir = path.dirname(path.resolve(projectRoot, interfaceRelativePath));
  const files = uniqueStrings(imports)
    .filter((value) => value.endsWith(".json") || value.endsWith(".jsonc"))
    .map((relativePath) => path.resolve(interfaceDir, relativePath));

  return files;
}

async function collectPipelineFiles(projectRoot: string): Promise<string[]> {
  const candidateRoots = [
    path.resolve(projectRoot, "assets/resource/pipeline"),
    path.resolve(projectRoot, "assets/resource_adb/pipeline"),
    path.resolve(projectRoot, "assets/resource_wlroots/pipeline"),
    path.resolve(projectRoot, "pipeline")
  ];

  const collected = await Promise.all(candidateRoots.map(async (pipelineRoot) => {
    try {
      return await fg(["**/*.json", "**/*.jsonc"], {
        cwd: pipelineRoot,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: true,
        ignore: [
          "**/.git/**",
          "**/node_modules/**",
          "**/.venv/**",
          "**/dist/**",
          "**/build/**",
          "**/.pnpm-store/**"
        ]
      });
    }
    catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : null;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }));

  return collected.flat();
}

function buildProjectDiagnostics(
  tasks: MaaSupportExtensionTaskDefinition[],
  options: MaaSupportExtensionOptionDefinition[],
  nodes: MaaSupportExtensionNodeDefinition[]
): MaaSupportExtensionDiagnostic[] {
  const diagnostics: MaaSupportExtensionDiagnostic[] = [];
  const taskNameToDefs = new Map<string, MaaSupportExtensionTaskDefinition[]>();
  const optionNames = new Set(options.map((option) => option.name));
  const nodeNames = new Set(nodes.map((node) => node.name));

  for (const task of tasks) {
    const existing = taskNameToDefs.get(task.name) ?? [];
    existing.push(task);
    taskNameToDefs.set(task.name, existing);
  }

  for (const [taskName, defs] of taskNameToDefs) {
    if (defs.length > 1) {
      const current = defs[1];
      diagnostics.push(MaaSupportExtensionDiagnosticSchema.parse({
        type: "conflict-task",
        level: "error",
        message: `Task ${taskName} is defined multiple times`,
        file: current.sourceFile,
        line: current.line,
        entity: taskName
      }));
    }
  }

  for (const task of tasks) {
    if (task.entry && !nodeNames.has(task.entry)) {
      diagnostics.push(MaaSupportExtensionDiagnosticSchema.parse({
        type: "int-unknown-entry-task",
        level: "error",
        message: `Task ${task.name} references unknown entry node ${task.entry}`,
        file: task.sourceFile,
        line: task.line,
        entity: task.name
      }));
    }

    for (const optionId of task.optionIds) {
      if (!optionNames.has(optionId)) {
        diagnostics.push(MaaSupportExtensionDiagnosticSchema.parse({
          type: "int-unknown-option",
          level: "error",
          message: `Task ${task.name} references unknown option ${optionId}`,
          file: task.sourceFile,
          line: task.line,
          entity: optionId
        }));
      }
    }
  }

  for (const node of nodes) {
    for (const target of [...node.next, ...node.onError]) {
      if (!nodeNames.has(target)) {
        diagnostics.push(MaaSupportExtensionDiagnosticSchema.parse({
          type: "unknown-task",
          level: "error",
          message: `Node ${node.name} references unknown node ${target}`,
          file: node.sourceFile,
          line: node.line,
          entity: target
        }));
      }
    }
  }

  return diagnostics;
}

async function buildProjectSnapshot(
  projectRoot: string,
  explicitInterfaceFile?: string
): Promise<ProjectSnapshot> {
  const { located, parsed } = await parseInterfaceFile(projectRoot, explicitInterfaceFile);
  const taskFiles = await collectTaskFiles(projectRoot, located.relativePath, parsed.import);
  const parsedTaskFiles = await Promise.all(taskFiles.map((file) => parseTaskFile(projectRoot, file)));
  const pipelineFiles = await collectPipelineFiles(projectRoot);
  const nodes = (await Promise.all(pipelineFiles.map((file) => parsePipelineFile(projectRoot, file)))).flat();
  const tasks = parsedTaskFiles.flatMap((item) => item.tasks);
  const options = parsedTaskFiles.flatMap((item) => item.options);
  const diagnostics = buildProjectDiagnostics(tasks, options, nodes);

  return {
    project_root: projectRoot,
    interface_file: located.relativePath,
    project_name: normalizeOptionalString(parsed.name),
    interface_version: parsed.interface_version ?? null,
    controller_names: parsed.controller.map((item) => item.name),
    resource_names: parsed.resource.map((item) => item.name),
    task_count: tasks.length,
    option_count: options.length,
    pipeline_file_count: pipelineFiles.length,
    node_count: nodes.length,
    tasks,
    options,
    node_names: uniqueStrings(nodes.map((node) => node.name)),
    nodes,
    diagnostics
  };
}

function filterTasks(snapshot: ProjectSnapshot, query: string) {
  return snapshot.tasks.filter((task) => task.name === query || task.entry === query);
}

function filterNodes(snapshot: ProjectSnapshot, query: string) {
  return snapshot.nodes.filter((node) => node.name === query);
}

async function runRuntimeCalls(input: MaaSupportExtensionRuntimeInput) {
  const snapshot = await buildProjectSnapshot(
    path.resolve(input.project.project_root),
    input.project.interface_file
  );

  const outputs: z.infer<typeof MaaSupportExtensionBatchInputSchema.shape.results> = [];
  const pushEnvelope = (tool: MaaSupportExtensionMethod, data: unknown) => {
    outputs.push({
      tool: MaaSupportExtensionMethodSchema.parse(tool),
      response: MaaSupportExtensionEnvelopeSchema.parse({
        request_id: `runtime-${tool}-${outputs.length + 1}`,
        api_version: "v1",
        ok: true,
        data,
        meta: {
          duration_ms: 0,
          warnings: []
        },
        error: null
      })
    });
  };

  pushEnvelope("parse_project", MaaSupportExtensionProjectSummarySchema.parse(snapshot));

  for (const taskName of input.queries.task_definitions) {
    pushEnvelope("get_task_definition", MaaSupportExtensionTaskDefinitionResultSchema.parse({
      query: taskName,
      matches: filterTasks(snapshot, taskName)
    }));
  }

  for (const nodeName of input.queries.node_definitions) {
    pushEnvelope("get_node_definition", MaaSupportExtensionNodeDefinitionResultSchema.parse({
      query: nodeName,
      matches: filterNodes(snapshot, nodeName)
    }));
  }

  if (input.queries.diagnostics) {
    pushEnvelope("run_project_diagnostic", MaaSupportExtensionDiagnosticResultSchema.parse({
      diagnostics: snapshot.diagnostics,
      summary: {
        error_count: snapshot.diagnostics.filter((item) => item.level === "error").length,
        warning_count: snapshot.diagnostics.filter((item) => item.level === "warning").length
      }
    }));
  }

  return outputs;
}

export async function normalizeMaaSupportExtensionRuntimeInput(
  input: MaaSupportExtensionRuntimeInput
): Promise<AdapterRunOutput> {
  const normalized = MaaSupportExtensionRuntimeInputSchema.parse(input);
  const projectRoot = path.resolve(normalized.project.project_root);

  try {
    const results = MaaSupportExtensionBatchInputSchema.parse({
      profileId: normalized.profileId ?? null,
      results: await runRuntimeCalls(normalized)
    });
    return normalizeMaaSupportExtensionResults(results);
  }
  catch (error) {
    if (isPermissionDeniedError(error)) {
      throw buildFilesystemPermissionError(error, projectRoot);
    }
    throw error;
  }
}

export const maaSupportExtensionRuntimeAdapter: ToolAdapter<MaaSupportExtensionRuntimeInput> = {
  id: "maa-support-extension-runtime",

  async normalize(input) {
    return normalizeMaaSupportExtensionRuntimeInput(input);
  }
};
