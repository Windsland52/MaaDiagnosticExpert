import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseJsonc } from "jsonc-parser";
import YAML from "yaml";
import { z } from "zod";

import type { AdapterRunOutput, ToolAdapter } from "./types.js";
import {
  FilesystemBatchInputSchema,
  FilesystemEnvelopeSchema,
  FilesystemFileSummarySchema,
  FilesystemMethodSchema,
  FilesystemSnapshotSchema,
  normalizeFilesystemResults,
  type FilesystemFileCategory,
  type FilesystemFileSummary
} from "./filesystem.js";

const JsonExtensions = new Set([".json", ".jsonc"]);
const YamlExtensions = new Set([".yaml", ".yml"]);
const ConfigExtensions = new Set([".json", ".jsonc", ".yaml", ".yml"]);
const ImageExtensions = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);
const LogExtensions = new Set([".log", ".txt"]);
const ArchiveExtensions = new Set([".zip"]);
const KnownConfigBasenames = new Set([
  "interface.json",
  "interface.jsonc",
  "maa_option.json",
  "maa_option.jsonc"
]);

export const FilesystemRuntimeInputSchema = z.object({
  profileId: z.string().min(1).nullable().optional(),
  roots: z.array(z.string().min(1)).min(1),
  includeGlobs: z.array(z.string().min(1)).default(() => ["**/*"]),
  excludeGlobs: z.array(z.string().min(1)).default(() => [
    "**/.git/**",
    "**/node_modules/**",
    "**/.venv/**",
    "**/dist/**",
    "**/build/**",
    "**/.pnpm-store/**"
  ]),
  maxFiles: z.number().int().min(1).max(2000).default(200),
  parseConfigFiles: z.boolean().default(true),
  includeImages: z.boolean().default(true)
});

export type FilesystemRuntimeInput = z.infer<typeof FilesystemRuntimeInputSchema>;

type RootDescriptor = {
  rootPath: string;
  absolutePath: string;
  isDirectory: boolean;
};

function normalizePath(input: string): string {
  return input.split(path.sep).join("/");
}

function relativeWithinRoot(root: RootDescriptor, absolutePath: string): string {
  if (!root.isDirectory) {
    return path.basename(absolutePath);
  }

  return normalizePath(path.relative(root.absolutePath, absolutePath));
}

function basenameLower(input: string): string {
  return path.basename(input).toLowerCase();
}

function looksLikeConfig(relativePath: string, extension: string): boolean {
  const normalized = relativePath.toLowerCase();
  const basename = basenameLower(relativePath);
  if (KnownConfigBasenames.has(basename)) {
    return true;
  }

  if (normalized.startsWith("config/") || normalized.includes("/config/")) {
    return true;
  }

  if (ConfigExtensions.has(extension) && basename.includes("option")) {
    return true;
  }

  return false;
}

function classifyFile(relativePath: string, extension: string): FilesystemFileCategory {
  if (ImageExtensions.has(extension)) {
    return "image";
  }

  if (ArchiveExtensions.has(extension)) {
    return "archive";
  }

  if (LogExtensions.has(extension)) {
    return "log";
  }

  if (looksLikeConfig(relativePath, extension)) {
    return "config";
  }

  return "other";
}

function inferParser(extension: string): "json" | "jsonc" | "yaml" | "text" | "binary" | null {
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".jsonc") {
    return "jsonc";
  }
  if (YamlExtensions.has(extension)) {
    return "yaml";
  }
  if (LogExtensions.has(extension)) {
    return "text";
  }
  if (ImageExtensions.has(extension) || ArchiveExtensions.has(extension)) {
    return "binary";
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectBooleanFlags(input: unknown, output: Record<string, boolean>): void {
  if (Array.isArray(input)) {
    for (const item of input) {
      collectBooleanFlags(item, output);
    }
    return;
  }

  if (!isRecord(input)) {
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "boolean" && key.toLowerCase() === "save_on_error") {
      output[key] = value;
      continue;
    }

    collectBooleanFlags(value, output);
  }
}

function parseConfigContent(
  content: string,
  parser: "json" | "jsonc" | "yaml" | "text" | "binary" | null
): { topLevelKeys: string[]; booleanFlags: Record<string, boolean>; hints: string[] } {
  if (!parser || parser === "text" || parser === "binary") {
    return {
      topLevelKeys: [],
      booleanFlags: {},
      hints: []
    };
  }

  let parsed: unknown;
  if (parser === "json") {
    parsed = JSON.parse(content);
  }
  else if (parser === "jsonc") {
    parsed = parseJsonc(content);
  }
  else {
    parsed = YAML.parse(content);
  }

  const topLevelKeys = isRecord(parsed) ? Object.keys(parsed) : [];
  const booleanFlags: Record<string, boolean> = {};
  collectBooleanFlags(parsed, booleanFlags);

  return {
    topLevelKeys,
    booleanFlags,
    hints: [
      ...topLevelKeys.includes("task") ? ["task"] : [],
      ...topLevelKeys.includes("option") ? ["option"] : [],
      ...Object.keys(booleanFlags).length > 0 ? ["boolean-flags"] : []
    ]
  };
}

async function resolveRoots(input: FilesystemRuntimeInput): Promise<RootDescriptor[]> {
  const roots: RootDescriptor[] = [];

  for (const rootPath of input.roots) {
    const absolutePath = path.resolve(rootPath);
    const stats = await lstat(absolutePath);
    roots.push({
      rootPath: normalizePath(rootPath),
      absolutePath,
      isDirectory: stats.isDirectory()
    });
  }

  return roots;
}

async function collectDirectoryFiles(
  root: RootDescriptor,
  includeGlobs: string[],
  excludeGlobs: string[]
): Promise<string[]> {
  return fg(includeGlobs, {
    cwd: root.absolutePath,
    onlyFiles: true,
    absolute: true,
    unique: true,
    ignore: excludeGlobs
  });
}

async function collectDirectoryCount(root: RootDescriptor, excludeGlobs: string[]): Promise<number> {
  const directories = await fg(["**/*"], {
    cwd: root.absolutePath,
    onlyDirectories: true,
    absolute: true,
    unique: true,
    ignore: excludeGlobs
  });

  return directories.length;
}

async function buildFileSummary(
  root: RootDescriptor,
  absolutePath: string,
  parseConfigFiles: boolean,
  includeImages: boolean
): Promise<FilesystemFileSummary> {
  const stats = await lstat(absolutePath);
  const relativePath = relativeWithinRoot(root, absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const category = classifyFile(relativePath, extension);
  const parser = inferParser(extension);

  let topLevelKeys: string[] = [];
  let booleanFlags: Record<string, boolean> = {};
  let hints: string[] = [];

  if (category === "config" && parseConfigFiles) {
    const content = await readFile(absolutePath, "utf8");
    const parsed = parseConfigContent(content, parser);
    topLevelKeys = parsed.topLevelKeys;
    booleanFlags = parsed.booleanFlags;
    hints = parsed.hints;
  }

  if (category === "image" && includeImages) {
    hints = [...hints, relativePath.toLowerCase().includes("on_error") ? "on_error" : "image"];
  }

  return FilesystemFileSummarySchema.parse({
    rootPath: normalizePath(root.absolutePath),
    path: normalizePath(absolutePath),
    relativePath,
    sizeBytes: stats.size,
    extension: extension.length > 0 ? extension : null,
    category,
    parser,
    topLevelKeys,
    booleanFlags,
    hints
  });
}

async function buildSnapshot(input: FilesystemRuntimeInput) {
  const roots = await resolveRoots(input);
  const filePaths: Array<{ root: RootDescriptor; absolutePath: string }> = [];
  let directoryCount = 0;

  for (const root of roots) {
    if (root.isDirectory) {
      const files = await collectDirectoryFiles(root, input.includeGlobs, input.excludeGlobs);
      directoryCount += await collectDirectoryCount(root, input.excludeGlobs);
      for (const absolutePath of files) {
        filePaths.push({ root, absolutePath });
      }
      continue;
    }

    filePaths.push({ root, absolutePath: root.absolutePath });
  }

  filePaths.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath));
  const selected = filePaths.slice(0, input.maxFiles);
  const files = await Promise.all(
    selected.map(({ root, absolutePath }) => {
      return buildFileSummary(root, absolutePath, input.parseConfigFiles, input.includeImages);
    })
  );

  return FilesystemSnapshotSchema.parse({
    rootPaths: roots.map((item) => normalizePath(item.absolutePath)),
    fileCount: filePaths.length,
    directoryCount,
    configCount: files.filter((item) => item.category === "config").length,
    imageCount: files.filter((item) => item.category === "image").length,
    logCount: files.filter((item) => item.category === "log").length,
    archiveCount: files.filter((item) => item.category === "archive").length,
    truncated: filePaths.length > input.maxFiles,
    omittedFileCount: Math.max(filePaths.length - input.maxFiles, 0),
    files
  });
}

export async function normalizeFilesystemRuntimeInput(
  input: FilesystemRuntimeInput
): Promise<AdapterRunOutput> {
  const normalized = FilesystemRuntimeInputSchema.parse(input);
  const snapshot = await buildSnapshot(normalized);
  const results = FilesystemBatchInputSchema.parse({
    profileId: normalized.profileId ?? null,
    results: [
      {
        tool: FilesystemMethodSchema.parse("scan_snapshot"),
        response: FilesystemEnvelopeSchema.parse({
          request_id: "runtime-scan_snapshot-1",
          api_version: "v1",
          ok: true,
          data: snapshot,
          meta: {
            duration_ms: 0,
            warnings: []
          },
          error: null
        })
      }
    ]
  });

  return normalizeFilesystemResults(results);
}

export const filesystemRuntimeAdapter: ToolAdapter<FilesystemRuntimeInput> = {
  id: "filesystem-runtime",

  async normalize(input) {
    return normalizeFilesystemRuntimeInput(input);
  }
};
