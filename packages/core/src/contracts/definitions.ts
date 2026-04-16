import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toJSONSchema, z } from "zod";

import {
  MaaLogAnalyzerBatchInputSchema,
  MaaLogAnalyzerRuntimeInputSchema
} from "../adapters/index.js";
import {
  CorpusCatalogSchema,
  CorpusSearchInputSchema,
  CorpusSearchResultSchema
} from "../models/corpus.js";
import { CoreErrorSchema } from "../models/core-error.js";
import { CoreResultSchema } from "../models/core-result.js";
import { ProfileCatalogSchema, RuntimeInfoSchema } from "../models/runtime-info.js";
import { ProfileSchema } from "../profiles/schema.js";

type ContractDefinition = {
  filename: string;
  title: string;
  description: string;
  schema: z.ZodType;
};

type ContractDocument = ContractDefinition & {
  document: Record<string, unknown>;
};

export const ContractDefinitions: ContractDefinition[] = [
  {
    filename: "core-result.schema.json",
    title: "CoreResult",
    description: "Structured output contract emitted by @maa-diagnostic-expert/core.",
    schema: CoreResultSchema
  },
  {
    filename: "error.schema.json",
    title: "CoreError",
    description: "Structured error contract emitted by @maa-diagnostic-expert/core runtime.",
    schema: CoreErrorSchema
  },
  {
    filename: "profile.schema.json",
    title: "Profile",
    description: "Analysis profile contract consumed by @maa-diagnostic-expert/core.",
    schema: ProfileSchema
  },
  {
    filename: "profile-catalog.schema.json",
    title: "ProfileCatalog",
    description: "Builtin profile catalog exposed by @maa-diagnostic-expert/core runtime.",
    schema: ProfileCatalogSchema
  },
  {
    filename: "runtime-info.schema.json",
    title: "RuntimeInfo",
    description: "Runtime discovery contract exposed by @maa-diagnostic-expert/core.",
    schema: RuntimeInfoSchema
  },
  {
    filename: "corpus-catalog.schema.json",
    title: "CorpusCatalog",
    description: "Builtin local corpus catalog exposed by @maa-diagnostic-expert/core runtime.",
    schema: CorpusCatalogSchema
  },
  {
    filename: "corpus-search-input.schema.json",
    title: "CorpusSearchInput",
    description: "Input contract for deterministic local corpus search.",
    schema: CorpusSearchInputSchema
  },
  {
    filename: "corpus-search-result.schema.json",
    title: "CorpusSearchResult",
    description: "Output contract for deterministic local corpus search.",
    schema: CorpusSearchResultSchema
  },
  {
    filename: "maa-log-analyzer-batch-input.schema.json",
    title: "MaaLogAnalyzerBatchInput",
    description: "Adapter input contract for normalizing existing Maa Log Analyzer tool results.",
    schema: MaaLogAnalyzerBatchInputSchema
  },
  {
    filename: "maa-log-analyzer-runtime-input.schema.json",
    title: "MaaLogAnalyzerRuntimeInput",
    description: "Adapter input contract for running Maa Log Analyzer from the local core runtime.",
    schema: MaaLogAnalyzerRuntimeInputSchema
  }
];

function buildContractDocument(definition: ContractDefinition): Record<string, unknown> {
  const schema = toJSONSchema(definition.schema, {
    target: "draft-2020-12"
  }) as Record<string, unknown>;

  return {
    ...schema,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://maa-diagnostic-expert/contracts/${definition.filename}`,
    title: definition.title,
    description: definition.description
  };
}

export function buildContractDocuments(): ContractDocument[] {
  return ContractDefinitions.map((definition) => ({
    ...definition,
    document: buildContractDocument(definition)
  }));
}

export function resolveContractsDir(): string {
  return path.resolve(fileURLToPath(new URL("../../../../contracts/", import.meta.url)));
}

export async function generateContractFiles(outputDir = resolveContractsDir()): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });

  const writtenPaths: string[] = [];
  for (const definition of buildContractDocuments()) {
    const outputPath = path.join(outputDir, definition.filename);
    await writeFile(outputPath, `${JSON.stringify(definition.document, null, 2)}\n`, "utf8");
    writtenPaths.push(outputPath);
  }

  return writtenPaths;
}
