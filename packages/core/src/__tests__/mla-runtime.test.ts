import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeMaaLogAnalyzerRuntimeInput } from "../adapters/index.js";
import { resetMlaRuntimeDependenciesCache } from "../adapters/mla-runtime-deps.js";

const tempDirs: string[] = [];
const originalLocalRoot = process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT;
const sampleLocalRoot = path.resolve(process.cwd(), "..", "..", "sample", "MaaLogAnalyzer");

function useSampleLocalRoot(): void {
  process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT = sampleLocalRoot;
  resetMlaRuntimeDependenciesCache();
}

function buildEventLine(
  timestamp: string,
  message: string,
  details: Record<string, unknown>
): string {
  return `[${timestamp}][INF][Px31480][Tx13412][Utils/EventDispatcher.hpp][L65][MaaNS::EventDispatcher::notify] !!!OnEventNotify!!! [handle=true] [msg=${message}] [details=${JSON.stringify(details)}]`;
}

async function createMlaLogFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-mla-"));
  tempDirs.push(root);
  await mkdir(root, { recursive: true });

  await writeFile(path.join(root, "maa.bak.log"), [
    buildEventLine("2026-04-15 12:00:00.000", "Tasker.Task.Starting", {
      entry: "DeliveryJobsMain",
      hash: "old-task",
      task_id: 200000009,
      uuid: "old-task"
    }),
    buildEventLine("2026-04-15 12:00:10.000", "Tasker.Task.Succeeded", {
      entry: "DeliveryJobsMain",
      hash: "old-task",
      task_id: 200000009,
      uuid: "old-task"
    })
  ].join("\n"), "utf8");

  await writeFile(path.join(root, "maafw.log"), [
    buildEventLine("2026-04-16 14:55:51.405", "Tasker.Task.Starting", {
      entry: "AutoCollectStart",
      hash: "current-task",
      task_id: 200000009,
      uuid: "current-task"
    }),
    buildEventLine("2026-04-16 14:56:38.238", "Node.PipelineNode.Starting", {
      task_id: 200000009,
      node_id: 300000637,
      name: "AutoCollectRoute1AssertLocation"
    }),
    buildEventLine("2026-04-16 14:56:38.282", "Node.Recognition.Starting", {
      task_id: 200000009,
      reco_id: 400003218,
      name: "AutoCollectRoute1GotoFind1"
    }),
    buildEventLine("2026-04-16 14:56:38.283", "Node.Recognition.Succeeded", {
      task_id: 200000009,
      reco_id: 400003218,
      name: "AutoCollectRoute1GotoFind1",
      reco_details: {
        reco_id: 400003218,
        algorithm: "DirectHit",
        box: [0, 0, 1280, 720],
        detail: null,
        name: "AutoCollectRoute1GotoFind1"
      }
    }),
    buildEventLine("2026-04-16 14:56:38.498", "Node.Action.Starting", {
      task_id: 200000009,
      action_id: 500000608,
      name: "AutoCollectRoute1GotoFind1"
    }),
    buildEventLine("2026-04-16 14:57:56.656", "Node.Action.Failed", {
      task_id: 200000009,
      action_id: 500000608,
      name: "AutoCollectRoute1GotoFind1",
      action_details: {
        action_id: 500000608,
        action: "Custom",
        box: [0, 0, 1280, 720],
        detail: {},
        name: "AutoCollectRoute1GotoFind1",
        success: false
      }
    }),
    buildEventLine("2026-04-16 14:57:56.745", "Node.PipelineNode.Failed", {
      task_id: 200000009,
      node_id: 300000637,
      name: "AutoCollectRoute1AssertLocation",
      reco_details: {
        reco_id: 400003218,
        algorithm: "DirectHit",
        box: [0, 0, 1280, 720],
        detail: null,
        name: "AutoCollectRoute1GotoFind1"
      },
      node_details: {
        action_id: 500000608,
        completed: false,
        name: "AutoCollectRoute1GotoFind1",
        node_id: 300000637,
        reco_id: 400003218
      }
    }),
    buildEventLine("2026-04-16 14:57:56.745", "Tasker.Task.Succeeded", {
      entry: "AutoCollectStart",
      hash: "current-task",
      task_id: 200000009,
      uuid: "current-task"
    })
  ].join("\n"), "utf8");

  await mkdir(path.join(root, "on_error"), { recursive: true });
  await writeFile(
    path.join(root, "on_error", "2026.04.16-14.57.56.745_AutoCollectRoute1AssertLocation.png"),
    "fake-image",
    "utf8"
  );

  return root;
}

afterEach(async () => {
  resetMlaRuntimeDependenciesCache();
  if (originalLocalRoot == null) {
    delete process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT;
  }
  else {
    process.env.MAA_DIAGNOSTIC_LOCAL_MLA_ROOT = originalLocalRoot;
  }
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("maa-log-analyzer runtime", () => {
  it("supports deterministic folder narrowing with focus keywords", async () => {
    useSampleLocalRoot();
    const logRoot = await createMlaLogFixture();

    const output = await normalizeMaaLogAnalyzerRuntimeInput({
      session_id: "session-primary-only",
      inputs: [
        {
          path: logRoot,
          kind: "folder",
          focus: {
            keywords: ["AutoCollectStart"]
          }
        }
      ],
      queries: {
        task_overview: {
          task_id: 200000009
        }
      }
    });

    const taskOverview = (output.observations ?? []).find((item) => item.kind === "task_overview");
    expect(taskOverview).toBeDefined();
    expect((taskOverview?.payload as { task?: { entry?: string } }).task?.entry).toBe("AutoCollectStart");
  });

  it("supports symlinked folder inputs when narrowing by focus", async () => {
    useSampleLocalRoot();
    const logRoot = await createMlaLogFixture();
    const linkRoot = `${logRoot}-link`;
    tempDirs.push(linkRoot);
    await symlink(logRoot, linkRoot, "dir");

    const output = await normalizeMaaLogAnalyzerRuntimeInput({
      session_id: "session-symlink",
      inputs: [
        {
          path: linkRoot,
          kind: "folder",
          focus: {
            keywords: ["AutoCollectStart"],
            started_after: "2026-04-16 00:00:00"
          }
        }
      ],
      queries: {
        task_overview: {
          task_id: 200000009
        }
      }
    });

    const taskOverview = (output.observations ?? []).find((item) => item.kind === "task_overview");
    expect(taskOverview).toBeDefined();
    expect((taskOverview?.payload as { task?: { entry?: string } }).task?.entry).toBe("AutoCollectStart");
  });

  it("surfaces MLA projector-linked image evidences from folder inputs", async () => {
    useSampleLocalRoot();
    const logRoot = await createMlaLogFixture();

    const output = await normalizeMaaLogAnalyzerRuntimeInput({
      session_id: "session-images",
      inputs: [
        {
          path: logRoot,
          kind: "folder",
          focus: {
            keywords: ["AutoCollectStart"]
          }
        }
      ],
      queries: {
        node_timeline: {
          task_id: 200000009,
          node_id: 300000637
        }
      }
    });

    const imageObservation = (output.observations ?? []).find((item) => item.kind === "scope_image_evidence");
    expect(imageObservation).toBeDefined();
    expect(imageObservation?.payload.image_path).toContain("AutoCollectRoute1AssertLocation.png");
  });
});
