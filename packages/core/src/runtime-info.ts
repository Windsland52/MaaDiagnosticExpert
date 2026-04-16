import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ContractDefinitions } from "./contracts/definitions.js";
import type { ProfileCatalog, RuntimeInfo } from "./models/runtime-info.js";
import { listBuiltinProfiles } from "./profiles/builtin.js";
import { listBuiltinCorpora } from "./retrieval/local.js";

const CORE_CLI_COMMANDS = [
  "empty-result",
  "validate-core-result",
  "render-report",
  "normalize-mla-result",
  "run-mla-runtime",
  "normalize-mse-result",
  "run-mse-runtime",
  "validate-profile",
  "show-builtin-profile",
  "list-builtin-profiles",
  "list-builtin-corpora",
  "prepare-builtin-corpora",
  "search-local-corpus",
  "run-diagnostic-pipeline",
  "describe-runtime"
] as const;

const CORE_ADAPTERS = [
  "maa-log-analyzer",
  "maa-log-analyzer-runtime",
  "maa-support-extension",
  "maa-support-extension-runtime"
] as const;

type PackageJsonShape = {
  name?: string;
  version?: string;
};

function readCorePackageJson(): PackageJsonShape {
  const packageJsonPath = path.resolve(
    fileURLToPath(new URL("../package.json", import.meta.url))
  );

  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJsonShape;
}

export function buildProfileCatalog(): ProfileCatalog {
  return {
    apiVersion: "profile-catalog/v1",
    profiles: listBuiltinProfiles()
  };
}

export function buildRuntimeInfo(): RuntimeInfo {
  const packageJson = readCorePackageJson();

  return {
    apiVersion: "runtime/v1",
    runtimeName: packageJson.name ?? "@maa-diagnostic-expert/core",
    runtimeVersion: packageJson.version ?? "0.0.0",
    commands: [...CORE_CLI_COMMANDS],
    adapters: [...CORE_ADAPTERS],
    builtinProfileIds: listBuiltinProfiles().map((profile) => profile.id),
    builtinCorpusIds: listBuiltinCorpora().map((corpus) => corpus.id),
    contracts: ContractDefinitions.map((definition) => ({
      name: definition.title,
      filename: definition.filename,
      title: definition.title,
      description: definition.description,
      schemaId: `https://maa-diagnostic-expert/contracts/${definition.filename}`
    }))
  };
}
