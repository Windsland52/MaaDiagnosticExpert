import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import { main } from "../../src/cli/main.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function mlaFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mek-cli-summary-"));
  temporaryRoots.push(root);
  const event = (timestamp: string, message: string, details: Record<string, unknown>): string =>
    `[${timestamp}][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`;
  await writeFile(
    path.join(root, "maafw.log"),
    [
      event("2026-07-19 10:00:59.000", "Tasker.Task.Starting", {
        task_id: 7, entry: "Combat", hash: "h1", uuid: "u1",
      }),
      event("2026-07-19 10:01:03.000", "Tasker.Task.Failed", {
        task_id: 7, entry: "Combat", hash: "h1", uuid: "u1",
      }),
    ].join("\n"),
    "utf8",
  );
  return root;
}

test("prints a stable CLI version without running inspection or telemetry", async () => {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });

  await expect(main(["--version"])).resolves.toBe(0);
  expect(output).toBe("0.4.0\n");
});

test("rejects mistyped options instead of silently treating them as positional arguments", async () => {
  let errorOutput = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errorOutput += String(chunk);
    return true;
  });

  await expect(main([
    "search",
    "--input",
    "missing.json",
    "node",
    "TaskName",
    "--kind",
    "mla.recognition_detail",
  ])).resolves.toBe(1);
  expect(errorOutput).toContain('Unexpected positional arguments: "node", "TaskName".');
  expect(errorOutput).not.toContain("ENOENT");
});

test("emits a bounded inspection summary instead of the full document", async () => {
  const root = await mlaFixture();
  const summaryPath = path.join(root, "summary.json");
  const fullPath = path.join(root, "inspection.json");

  expect(await main(["mla", "inspect", root, "--summary", "--format", "json", "--output", summaryPath])).toBe(0);
  expect(await main(["mla", "inspect", root, "--format", "json", "--output", fullPath])).toBe(0);

  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>;
  expect(summary["schemaVersion"]).toBe("maa-evidence-summary/v1");
  expect(summary["kind"]).toBe("mla");
  expect(summary).not.toHaveProperty("evidence");
  expect(summary).not.toHaveProperty("details");
  expect(summary["statistics"]).toBeDefined();
  expect(Array.isArray(summary["evidenceKinds"])).toBe(true);
  expect(typeof summary["evidenceCount"]).toBe("number");

  const full = await readFile(fullPath, "utf8");
  expect((await readFile(summaryPath, "utf8")).length).toBeLessThan(full.length);
});

test("emits a text inspection summary naming artifacts and evidence kinds", async () => {
  const root = await mlaFixture();
  const summaryPath = path.join(root, "summary.txt");

  expect(await main(["mla", "inspect", root, "--summary", "--format", "text", "--output", summaryPath])).toBe(0);

  const summary = await readFile(summaryPath, "utf8");
  expect(summary).toContain("MaaEvidenceKit mla inspection summary");
  expect(summary).toContain("maafw.log");
  expect(summary).toContain("Evidence:");
});

test("rejects Mermaid output for an inspection summary", async () => {
  const root = await mlaFixture();
  let errorOutput = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errorOutput += String(chunk);
    return true;
  });

  await expect(main(["mla", "inspect", root, "--summary", "--format", "mermaid"])).resolves.toBe(1);
  expect(errorOutput).toContain("--summary supports --format json or text.");
});

test("rejects Mermaid output for repository documentation inventory", async () => {
  let errorOutput = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errorOutput += String(chunk);
    return true;
  });

  await expect(main(["repo-docs", ".", "--format", "mermaid"])).resolves.toBe(1);
  expect(errorOutput).toContain("repo-docs --format must be json or text");
});
