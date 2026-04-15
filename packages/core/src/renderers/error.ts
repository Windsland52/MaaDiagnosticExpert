import type { CoreError } from "../models/core-error.js";

export function renderCoreErrorJson(error: CoreError, pretty = true): string {
  return JSON.stringify(error, null, pretty ? 2 : 0);
}
