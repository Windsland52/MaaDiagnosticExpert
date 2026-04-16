import { describe, expect, it } from "vitest";

import { buildContractDocuments, resolveContractsDir } from "../contracts/definitions.js";

describe("contracts", () => {
  it("builds the first batch of cross-language contracts", () => {
    const documents = buildContractDocuments();
    const filenames = documents.map((item) => item.filename);

    expect(filenames).toEqual([
      "core-result.schema.json",
      "error.schema.json",
      "profile.schema.json",
      "profile-catalog.schema.json",
      "runtime-info.schema.json",
      "corpus-catalog.schema.json",
      "corpus-search-input.schema.json",
      "corpus-search-result.schema.json",
      "corpus-prepare-input.schema.json",
      "corpus-prepare-result.schema.json",
      "maa-log-analyzer-batch-input.schema.json",
      "maa-log-analyzer-runtime-input.schema.json",
      "maa-support-extension-batch-input.schema.json",
      "maa-support-extension-runtime-input.schema.json",
      "diagnostic-pipeline-input.schema.json"
    ]);

    const coreResult = documents.find((item) => item.filename === "core-result.schema.json");
    expect(coreResult?.document.$id).toBe(
      "https://maa-diagnostic-expert/contracts/core-result.schema.json"
    );
    expect(coreResult?.document.type).toBe("object");

    const runtimeInput = documents.find(
      (item) => item.filename === "maa-log-analyzer-runtime-input.schema.json"
    );
    const properties = runtimeInput?.document.properties as Record<string, unknown> | undefined;
    expect(properties).toHaveProperty("session_id");
    expect(properties).toHaveProperty("inputs");
  });

  it("resolves the root contracts directory", () => {
    expect(resolveContractsDir()).toMatch(/[/\\]contracts$/);
  });
});
