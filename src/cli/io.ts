import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import {
  UsageError,
  errnoCode,
  isInspectionResult,
  isMissingPathError,
  type InspectionResult,
} from "../evidence/index.js";
import { profileStage } from "../profiling.js";

export async function readInspection(file: string): Promise<InspectionResult> {
  return profileStage("inspection.load", async () => {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error: unknown) {
      if (errnoCode(error) === "EISDIR") throw new UsageError(`Input path is not a file: ${file}`);
      if (isMissingPathError(error)) throw new UsageError(`Input file not found: ${file}`);
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isInspectionResult(parsed)) {
      throw new UsageError(`Input is not a ${"maa-evidence/v1"} inspection result: ${file}`);
    }
    return parsed;
  });
}

export async function emit(content: string, output?: string): Promise<void> {
  const terminated = content.endsWith("\n") ? content : `${content}\n`;
  if (output === undefined) {
    await profileStage("output.write", async () => {
      process.stdout.write(terminated);
    });
    return;
  }
  try {
    await profileStage("output.write", () => writeFile(output, terminated, "utf8"));
  } catch (error: unknown) {
    if (errnoCode(error) === "EISDIR") {
      throw new UsageError(`Output path is a directory: ${output}`);
    }
    if (isMissingPathError(error)) {
      throw new UsageError(
        errnoCode(error) === "ENOTDIR"
          ? `Output path is not a directory: ${path.dirname(output)}`
          : `Output directory does not exist: ${path.dirname(output)}`,
      );
    }
    throw error;
  }
}
