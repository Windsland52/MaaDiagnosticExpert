import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeMaaSupportExtensionRuntimeInput } from "../adapters/index.js";

const tempDirs: string[] = [];

async function createMaaProjectFixture(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-mse-"));
  tempDirs.push(projectRoot);

  await mkdir(path.join(projectRoot, "assets", "resource", "pipeline"), { recursive: true });
  await mkdir(path.join(projectRoot, "tasks"), { recursive: true });

  await writeFile(
    path.join(projectRoot, "assets", "interface.json"),
    JSON.stringify(
      {
        interface_version: 2,
        name: "Fixture Project",
        controller: [{ name: "Win32" }],
        resource: [{ name: "default" }],
        import: ["../tasks/Daily.json"]
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(projectRoot, "tasks", "Daily.json"),
    JSON.stringify(
      {
        task: [
          {
            name: "DailyRewards",
            entry: "StartNode",
            group: "Daily",
            option: ["UsePotion"]
          },
          {
            name: "BrokenTask",
            entry: "GhostNode",
            option: ["MissingOption"]
          }
        ],
        option: {
          UsePotion: {
            type: "select",
            cases: [
              {
                name: "on",
                pipeline_override: {
                  RewardNode: {}
                }
              }
            ]
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(projectRoot, "assets", "resource", "pipeline", "DailyRewards.json"),
    JSON.stringify(
      {
        StartNode: {
          next: ["RewardNode"],
          on_error: ["MissingNode"]
        },
        RewardNode: {
          next: []
        }
      },
      null,
      2
    ),
    "utf8"
  );

  return projectRoot;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("maa-support-extension runtime", () => {
  it("parses project structure and emits diagnostics", async () => {
    const projectRoot = await createMaaProjectFixture();

    const output = await normalizeMaaSupportExtensionRuntimeInput({
      profileId: "generic-maa-log",
      project: {
        project_root: projectRoot,
        interface_file: "assets/interface.json"
      },
      queries: {
        task_definitions: ["DailyRewards"],
        node_definitions: ["StartNode"],
        diagnostics: true
      }
    });

    expect(output.toolName).toBe("maa-support-extension");
    expect(Array.isArray(output.rawResult)).toBe(true);
    expect((output.observations ?? []).some((item) => item.kind === "maa_project_summary")).toBe(true);
    expect((output.observations ?? []).some((item) => item.kind === "maa_task_definition")).toBe(true);
    expect((output.observations ?? []).some((item) => item.kind === "maa_node_definition")).toBe(true);
    expect((output.findings ?? []).some((item) => item.kind === "maa_project_definition_errors")).toBe(true);
    expect((output.profileHints ?? []).some((item) => item.value === "maa-support-extension")).toBe(true);
  });

  it("reports missing task definitions as missing evidence", async () => {
    const projectRoot = await createMaaProjectFixture();

    const output = await normalizeMaaSupportExtensionRuntimeInput({
      project: {
        project_root: projectRoot,
        interface_file: "assets/interface.json"
      },
      queries: {
        task_definitions: ["MissingTask"],
        node_definitions: [],
        diagnostics: false
      }
    });

    expect(output.missingEvidence ?? []).toHaveLength(1);
    expect(output.missingEvidence?.[0]?.description).toContain("MissingTask");
  });
});
