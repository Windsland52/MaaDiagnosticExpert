#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

import { z } from "zod";

import {
  FilesystemBatchInputSchema,
  FilesystemRuntimeInputSchema,
  MaaLogAnalyzerBatchInputSchema,
  MaaLogAnalyzerRuntimeInputSchema,
  MaaSupportExtensionBatchInputSchema,
  MaaSupportExtensionRuntimeInputSchema,
  normalizeFilesystemResults,
  normalizeFilesystemRuntimeInput,
  normalizeMaaLogAnalyzerResults,
  normalizeMaaLogAnalyzerRuntimeInput,
  normalizeMaaSupportExtensionResults,
  normalizeMaaSupportExtensionRuntimeInput
} from "./adapters/index.js";
import { runDiagnosticPipeline } from "./diagnostic-pipeline.js";
import { toCoreError } from "./errors.js";
import { createEmptyCoreResult, parseCoreResult } from "./factories.js";
import { buildProfileCatalog, buildRuntimeInfo } from "./runtime-info.js";
import {
  CorpusPrepareInputSchema,
  CorpusSearchInputSchema
} from "./models/corpus.js";
import { DiagnosticPipelineInputSchema } from "./models/diagnostic-pipeline.js";
import {
  buildCorpusCatalog,
  prepareBuiltinCorpora,
  searchLocalCorpora
} from "./retrieval/local.js";
import { buildCoreResultFromAdapterOutput } from "./results.js";
import { renderCoreErrorJson } from "./renderers/error.js";
import { renderCoreResultJson } from "./renderers/json.js";
import { buildMarkdownReport, renderCoreResultMarkdown } from "./renderers/markdown.js";
import { loadProfileFromFile, requireProfile } from "./profiles/loader.js";
import { readJsonInput } from "./io.js";

type ParsedArgs = {
  command: string;
  options: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command = "help", ...rest] = normalizedArgv;
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

function requireStringOption(
  options: Record<string, string | boolean>,
  key: string
): string {
  const value = options[key];
  const schema = z.string().min(1);
  return schema.parse(value);
}

function isEnabledOption(
  options: Record<string, string | boolean>,
  key: string
): boolean {
  const value = options[key];
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return false;
}

async function writeOutput(value: string, outputPath?: string): Promise<void> {
  if (outputPath) {
    await writeFile(outputPath, value, "utf8");
    return;
  }

  process.stdout.write(`${value}\n`);
}

function printHelp(): string {
  return [
    "maa-diagnostic-core",
    "",
    "Global options:",
    "  --json-error            Render structured error JSON to stderr on failure",
    "",
    "Commands:",
    "  empty-result [--profile <id>] [--output <path>]",
    "  validate-core-result [--input <path>] [--output <path>]",
    "  render-report [--input <path>] [--format markdown|json] [--output <path>]",
    "  normalize-filesystem-result [--input <path>] [--with-report] [--output <path>]",
    "  run-filesystem-runtime [--input <path>] [--with-report] [--output <path>]",
    "  normalize-mla-result [--input <path>] [--with-report] [--output <path>]",
    "  run-mla-runtime [--input <path>] [--with-report] [--output <path>]",
    "  normalize-mse-result [--input <path>] [--with-report] [--output <path>]",
    "  run-mse-runtime [--input <path>] [--with-report] [--output <path>]",
    "  validate-profile --input <path> [--output <path>]",
    "  show-builtin-profile --id <id> [--output <path>]",
    "  list-builtin-profiles [--output <path>]",
    "  list-builtin-corpora [--output <path>]",
    "  prepare-builtin-corpora [--input <path>] [--output <path>]",
    "  search-local-corpus [--input <path>] [--output <path>]",
    "  run-diagnostic-pipeline [--input <path>] [--with-report] [--output <path>]",
    "  describe-runtime [--output <path>]"
  ].join("\n");
}

function renderCliError(error: unknown): string {
  const { command, options } = parseArgs(process.argv.slice(2));
  const normalized = toCoreError(error, {
    meta: {
      command
    }
  });

  if (isEnabledOption(options, "json-error")) {
    return renderCoreErrorJson(normalized);
  }

  return normalized.message;
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const outputPath = typeof options.output === "string" ? options.output : undefined;

  switch (command) {
    case "empty-result": {
      const profileId = typeof options.profile === "string" ? options.profile : null;
      const result = createEmptyCoreResult(profileId);
      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "validate-core-result": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const result = parseCoreResult(await readJsonInput(inputPath));
      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "render-report": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const format = typeof options.format === "string" ? options.format : "markdown";
      const result = parseCoreResult(await readJsonInput(inputPath));

      if (format === "json") {
        await writeOutput(JSON.stringify(buildMarkdownReport(result), null, 2), outputPath);
        return;
      }

      await writeOutput(renderCoreResultMarkdown(result), outputPath);
      return;
    }

    case "normalize-mla-result": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = MaaLogAnalyzerBatchInputSchema.parse(await readJsonInput(inputPath));
      const output = normalizeMaaLogAnalyzerResults(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "normalize-filesystem-result": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = FilesystemBatchInputSchema.parse(await readJsonInput(inputPath));
      const output = normalizeFilesystemResults(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "run-filesystem-runtime": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = FilesystemRuntimeInputSchema.parse(await readJsonInput(inputPath));
      const output = await normalizeFilesystemRuntimeInput(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "run-mla-runtime": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = MaaLogAnalyzerRuntimeInputSchema.parse(await readJsonInput(inputPath));
      const output = await normalizeMaaLogAnalyzerRuntimeInput(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "normalize-mse-result": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = MaaSupportExtensionBatchInputSchema.parse(await readJsonInput(inputPath));
      const output = normalizeMaaSupportExtensionResults(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "run-mse-runtime": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = MaaSupportExtensionRuntimeInputSchema.parse(await readJsonInput(inputPath));
      const output = await normalizeMaaSupportExtensionRuntimeInput(payload);
      const result = buildCoreResultFromAdapterOutput(output, payload.profileId ?? null);

      if (isEnabledOption(options, "with-report")) {
        result.report = buildMarkdownReport(result);
      }

      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "validate-profile": {
      const inputPath = requireStringOption(options, "input");
      const profile = await loadProfileFromFile(inputPath);
      await writeOutput(JSON.stringify(profile, null, 2), outputPath);
      return;
    }

    case "show-builtin-profile": {
      const profileId = requireStringOption(options, "id");
      const profile = requireProfile(profileId);
      await writeOutput(JSON.stringify(profile, null, 2), outputPath);
      return;
    }

    case "list-builtin-profiles": {
      await writeOutput(JSON.stringify(buildProfileCatalog(), null, 2), outputPath);
      return;
    }

    case "list-builtin-corpora": {
      await writeOutput(JSON.stringify(buildCorpusCatalog(), null, 2), outputPath);
      return;
    }

    case "prepare-builtin-corpora": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = CorpusPrepareInputSchema.parse(await readJsonInput(inputPath));
      const result = await prepareBuiltinCorpora(payload);
      await writeOutput(JSON.stringify(result, null, 2), outputPath);
      return;
    }

    case "search-local-corpus": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = CorpusSearchInputSchema.parse(await readJsonInput(inputPath));
      const result = await searchLocalCorpora(payload);
      await writeOutput(JSON.stringify(result, null, 2), outputPath);
      return;
    }

    case "run-diagnostic-pipeline": {
      const inputPath = typeof options.input === "string" ? options.input : undefined;
      const payload = DiagnosticPipelineInputSchema.parse(await readJsonInput(inputPath));
      const result = await runDiagnosticPipeline(payload, {
        withReport: isEnabledOption(options, "with-report")
      });
      await writeOutput(renderCoreResultJson(result), outputPath);
      return;
    }

    case "describe-runtime": {
      await writeOutput(JSON.stringify(buildRuntimeInfo(), null, 2), outputPath);
      return;
    }

    case "help":
    default: {
      await writeOutput(printHelp(), outputPath);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${renderCliError(error)}\n`);
  process.exitCode = 1;
});
