import type { CoreResult } from "../models/core-result.js";

export function renderCoreResultJson(result: CoreResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
