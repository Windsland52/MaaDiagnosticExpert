import { readFile } from "node:fs/promises";

import { parse as parseJsonc } from "jsonc-parser";

export async function readJsonInput(inputPath?: string): Promise<unknown> {
  if (inputPath) {
    const raw = await readFile(inputPath, "utf8");
    return parseJsonc(raw);
  }

  const raw = await readStdin();
  return parseJsonc(raw);
}

export async function readTextInput(inputPath?: string): Promise<string> {
  if (inputPath) {
    return readFile(inputPath, "utf8");
  }

  return readStdin();
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf8");
}
