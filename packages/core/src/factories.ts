import { CoreResultSchema, type CoreResult } from "./models/core-result.js";

export function createEmptyCoreResult(profileId: string | null = null): CoreResult {
  return CoreResultSchema.parse({
    apiVersion: "core/v1",
    profileId,
    rawToolResults: {},
    diagnosticMeta: {
      observations: [],
      findings: [],
      retrievalHits: [],
      profileHints: [],
      missingEvidence: []
    }
  });
}

export function parseCoreResult(input: unknown): CoreResult {
  return CoreResultSchema.parse(input);
}
