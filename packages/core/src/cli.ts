#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

import { z } from "zod";

import { createEmptyCoreResult, parseCoreResult } from "./factories.js";
import { renderCoreResultJson } from "./renderers/json.js";
import { buildMarkdownReport, renderCoreResultMarkdown } from "./renderers/markdown.js";
import { loadProfileFromFile, requireProfile } from "./profiles/loader.js";
import { readJsonInput } from "./io.js";

type ParsedArgs = {
  command: string;
  options: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
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
    "Commands:",
    "  empty-result [--profile <id>] [--output <path>]",
    "  validate-core-result [--input <path>] [--output <path>]",
    "  render-report [--input <path>] [--format markdown|json] [--output <path>]",
    "  validate-profile --input <path> [--output <path>]",
    "  show-builtin-profile --id <id> [--output <path>]"
  ].join("\n");
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

    case "help":
    default: {
      await writeOutput(printHelp(), outputPath);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
