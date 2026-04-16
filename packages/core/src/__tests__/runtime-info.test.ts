import { describe, expect, it } from "vitest";

import { buildProfileCatalog, buildRuntimeInfo } from "../runtime-info.js";
import { buildCorpusCatalog } from "../retrieval/local.js";

describe("runtime info", () => {
  it("builds a profile catalog for builtin profiles", () => {
    const catalog = buildProfileCatalog();

    expect(catalog.apiVersion).toBe("profile-catalog/v1");
    expect(catalog.profiles.length).toBeGreaterThan(0);
    expect(catalog.profiles[0]?.id).toBe("generic-maa-log");
  });

  it("builds a corpus catalog for builtin corpora", () => {
    const catalog = buildCorpusCatalog();

    expect(catalog.apiVersion).toBe("corpus-catalog/v1");
    expect(catalog.corpora.length).toBeGreaterThan(0);
    expect(catalog.corpora.some((corpus) => corpus.id === "maafw-docs")).toBe(true);
    expect(catalog.corpora.some((corpus) => corpus.id === "diagnostic-guides")).toBe(true);
  });

  it("builds runtime discovery metadata", () => {
    const runtimeInfo = buildRuntimeInfo();

    expect(runtimeInfo.apiVersion).toBe("runtime/v1");
    expect(runtimeInfo.runtimeName).toBe("@maa-diagnostic-expert/core");
    expect(runtimeInfo.commands).toContain("describe-runtime");
    expect(runtimeInfo.commands).toContain("list-builtin-profiles");
    expect(runtimeInfo.commands).toContain("list-builtin-corpora");
    expect(runtimeInfo.commands).toContain("prepare-builtin-corpora");
    expect(runtimeInfo.commands).toContain("search-local-corpus");
    expect(runtimeInfo.commands).toContain("normalize-filesystem-result");
    expect(runtimeInfo.commands).toContain("run-filesystem-runtime");
    expect(runtimeInfo.commands).toContain("normalize-mse-result");
    expect(runtimeInfo.commands).toContain("run-mse-runtime");
    expect(runtimeInfo.commands).toContain("run-diagnostic-pipeline");
    expect(runtimeInfo.adapters).toContain("filesystem");
    expect(runtimeInfo.adapters).toContain("filesystem-runtime");
    expect(runtimeInfo.adapters).toContain("maa-log-analyzer");
    expect(runtimeInfo.adapters).toContain("maa-support-extension");
    expect(runtimeInfo.adapters).toContain("maa-support-extension-runtime");
    expect(runtimeInfo.builtinProfileIds).toContain("generic-maa-log");
    expect(runtimeInfo.builtinCorpusIds).toContain("maafw-docs");
    expect(runtimeInfo.builtinCorpusIds).toContain("diagnostic-guides");
    expect(runtimeInfo.contracts.some((item) => item.filename === "runtime-info.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "profile-catalog.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "corpus-catalog.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "corpus-search-result.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "corpus-prepare-result.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "filesystem-runtime-input.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "maa-support-extension-runtime-input.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "diagnostic-pipeline-input.schema.json")).toBe(true);
  });
});
