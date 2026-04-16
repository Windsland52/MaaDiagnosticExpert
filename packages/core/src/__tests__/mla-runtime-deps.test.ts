import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadMlaRuntimeDependencies,
  resetMlaRuntimeDependenciesCache
} from "../adapters/mla-runtime-deps.js";

const tempDirs: string[] = [];
const originalLocalRoot = process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT;

afterEach(async () => {
  resetMlaRuntimeDependenciesCache();

  if (originalLocalRoot == null) {
    delete process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT;
  }
  else {
    process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT = originalLocalRoot;
  }

  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("mla runtime dependency loader", () => {
  it("prefers an explicit local MaaLogAnalyzer dist override", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-mla-local-"));
    tempDirs.push(root);

    const parserDist = path.join(root, "packages", "maa-log-parser", "dist", "core");
    const toolsDist = path.join(root, "packages", "maa-log-tools", "dist");
    await mkdir(parserDist, { recursive: true });
    await mkdir(toolsDist, { recursive: true });

    await writeFile(
      path.join(parserDist, "index.js"),
      [
        "export function createAnalyzerSessionStore() {",
        "  return {",
        "    get() { return undefined; },",
        "    set(session) { return session; }",
        "  };",
        "}",
        "export function createAnalyzerToolHandlers() {",
        "  return {};",
        "}"
      ].join("\n"),
      "utf8"
    );

    await writeFile(
      path.join(toolsDist, "nodeInput.js"),
      [
        "export async function readNodeTextFileContent() { return ''; }",
        "export async function loadNodeLogDirectory() { return null; }",
        "export async function extractZipContentFromNodeFile() { return null; }"
      ].join("\n"),
      "utf8"
    );

    process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT = root;
    resetMlaRuntimeDependenciesCache();

    const dependencies = await loadMlaRuntimeDependencies();
    expect(dependencies.source).toBe(`local:${root}`);
    expect(typeof dependencies.createAnalyzerSessionStore).toBe("function");
    expect(typeof dependencies.readNodeTextFileContent).toBe("function");
  });

  it("fails fast when an explicit local override has no built dist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-mla-missing-"));
    tempDirs.push(root);

    process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT = root;
    resetMlaRuntimeDependenciesCache();

    await expect(loadMlaRuntimeDependencies()).rejects.toThrow(
      "Local MaaLogAnalyzer override is missing built dist files"
    );
  });
});
