import type { AdapterRunOutput } from "./adapters/types.js";
import { createEmptyCoreResult } from "./factories.js";
import type { CoreResult } from "./models/core-result.js";

export function mergeAdapterOutputs(
  outputs: AdapterRunOutput[],
  profileId: string | null = null
): CoreResult {
  const result = createEmptyCoreResult(profileId);

  for (const output of outputs) {
    result.rawToolResults[output.toolName] = output.rawResult;

    if (output.observations) {
      result.diagnosticMeta.observations.push(...output.observations);
    }

    if (output.findings) {
      result.diagnosticMeta.findings.push(...output.findings);
    }

    if (output.retrievalHits) {
      result.diagnosticMeta.retrievalHits.push(...output.retrievalHits);
    }

    if (output.profileHints) {
      result.diagnosticMeta.profileHints.push(...output.profileHints);
    }

    if (output.missingEvidence) {
      result.diagnosticMeta.missingEvidence.push(...output.missingEvidence);
    }

    if (output.report && !result.report) {
      result.report = output.report;
    }
  }

  return result;
}

export function buildCoreResultFromAdapterOutput(
  output: AdapterRunOutput,
  profileId: string | null = null
): CoreResult {
  return mergeAdapterOutputs([output], profileId);
}
