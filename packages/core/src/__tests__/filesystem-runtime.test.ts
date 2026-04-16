import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeFilesystemRuntimeInput } from "../adapters/index.js";

const tempDirs: string[] = [];

async function createFilesystemFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-fs-"));
  tempDirs.push(root);

  await mkdir(path.join(root, "config"), { recursive: true });
  await mkdir(path.join(root, "on_error"), { recursive: true });

  await writeFile(
    path.join(root, "config", "maa_option.json"),
    JSON.stringify(
      {
        save_on_error: true,
        task: {
          DailyRewards: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(path.join(root, "on_error", "scene.png"), "fake-image", "utf8");
  await writeFile(path.join(root, "maa.log"), "log content", "utf8");

  return root;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("filesystem runtime", () => {
  it("scans config snapshots and screenshot evidence", async () => {
    const root = await createFilesystemFixture();

    const output = await normalizeFilesystemRuntimeInput({
      profileId: "generic-maa-log",
      roots: [root],
      includeGlobs: ["**/*"],
      excludeGlobs: [],
      maxFiles: 50,
      parseConfigFiles: true,
      includeImages: true
    });

    expect(output.toolName).toBe("filesystem");
    expect((output.observations ?? []).some((item) => item.kind === "filesystem_snapshot")).toBe(true);
    expect((output.observations ?? []).some((item) => item.kind === "config_snapshot")).toBe(true);
    expect((output.observations ?? []).some((item) => item.kind === "error_screenshot")).toBe(true);
    expect((output.findings ?? []).some((item) => item.kind === "config_snapshot_available")).toBe(true);
    expect((output.findings ?? []).some((item) => item.kind === "error_screenshot_available")).toBe(true);
    expect((output.findings ?? []).some((item) => item.statement.includes("save_on_error=true"))).toBe(true);
  });

  it("reports missing screenshots when on_error is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-fs-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "config"), { recursive: true });
    await writeFile(path.join(root, "config", "settings.json"), "{\"x\":1}", "utf8");

    const output = await normalizeFilesystemRuntimeInput({
      roots: [root],
      includeGlobs: ["**/*"],
      excludeGlobs: [],
      maxFiles: 50,
      parseConfigFiles: true,
      includeImages: true
    });

    expect(output.missingEvidence?.some((item) => item.id.includes("missing:filesystem:image"))).toBe(true);
  });
});
