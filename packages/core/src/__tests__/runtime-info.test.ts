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
    expect(catalog.corpora.some((corpus) => corpus.id === "diagnostic-guides")).toBe(true);
  });

  it("builds runtime discovery metadata", () => {
    const runtimeInfo = buildRuntimeInfo();

    expect(runtimeInfo.apiVersion).toBe("runtime/v1");
    expect(runtimeInfo.runtimeName).toBe("@maa-diagnostic-expert/core");
    expect(runtimeInfo.commands).toContain("describe-runtime");
    expect(runtimeInfo.commands).toContain("list-builtin-profiles");
    expect(runtimeInfo.commands).toContain("list-builtin-corpora");
    expect(runtimeInfo.commands).toContain("search-local-corpus");
    expect(runtimeInfo.adapters).toContain("maa-log-analyzer");
    expect(runtimeInfo.builtinProfileIds).toContain("generic-maa-log");
    expect(runtimeInfo.builtinCorpusIds).toContain("diagnostic-guides");
    expect(runtimeInfo.contracts.some((item) => item.filename === "runtime-info.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "profile-catalog.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "corpus-catalog.schema.json")).toBe(true);
    expect(runtimeInfo.contracts.some((item) => item.filename === "corpus-search-result.schema.json")).toBe(true);
  });
});
