import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDiagnosticPipeline } from "../diagnostic-pipeline.js";

const tempDirs: string[] = [];

async function createMaaProjectFixture(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-pipeline-"));
  tempDirs.push(projectRoot);

  await mkdir(path.join(projectRoot, "assets", "resource", "pipeline"), { recursive: true });
  await mkdir(path.join(projectRoot, "config"), { recursive: true });
  await mkdir(path.join(projectRoot, "on_error"), { recursive: true });
  await mkdir(path.join(projectRoot, "tasks"), { recursive: true });

  await writeFile(
    path.join(projectRoot, "assets", "interface.json"),
    JSON.stringify(
      {
        interface_version: 2,
        name: "Pipeline Fixture",
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
            option: ["UsePotion"]
          }
        ],
        option: {
          UsePotion: {
            type: "checkbox"
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
          on_error: ["RecoverNode"]
        },
        RewardNode: {
          next: []
        },
        RecoverNode: {
          next: ["RewardNode"]
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(projectRoot, "config", "maa_option.json"),
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

  await writeFile(path.join(projectRoot, "on_error", "scene.png"), "fake-image", "utf8");

  return projectRoot;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("diagnostic pipeline", () => {
  it("merges MLA, MSE and local retrieval into one core result", async () => {
    const projectRoot = await createMaaProjectFixture();

    const result = await runDiagnosticPipeline(
      {
        apiVersion: "diagnostic-pipeline/v1",
        profileId: "generic-maa-log",
        mla: {
          mode: "result",
          input: {
            profileId: "generic-maa-log",
            results: [
              {
                tool: "parse_log_bundle",
                response: {
                  request_id: "mla-1",
                  api_version: "v1",
                  ok: true,
                  data: {
                    session_id: "session-1",
                    task_count: 1,
                    event_count: 12,
                    warnings: []
                  },
                  meta: {
                    duration_ms: 1,
                    warnings: []
                  },
                  error: null
                }
              },
              {
                tool: "get_task_overview",
                response: {
                  request_id: "mla-2",
                  api_version: "v1",
                  ok: true,
                  data: {
                    task: {
                      task_id: 7,
                      entry: "DailyRewards",
                      status: "failed",
                      duration_ms: 1234
                    },
                    summary: {
                      node_count: 4,
                      failed_node_count: 1,
                      reco_failed_count: 2
                    },
                    evidences: []
                  },
                  meta: {
                    duration_ms: 1,
                    warnings: []
                  },
                  error: null
                }
              },
              {
                tool: "get_node_timeline",
                response: {
                  request_id: "mla-3",
                  api_version: "v1",
                  ok: true,
                  data: {
                    timeline: [
                      {
                        scope_id: "node-1",
                        occurrence_index: 1,
                        ts: "2026-04-16T00:00:00Z",
                        event: "enter",
                        node_id: 11,
                        name: "StartNode",
                        source_key: "maa.log",
                        line: 42
                      }
                    ],
                    evidences: []
                  },
                  meta: {
                    duration_ms: 1,
                    warnings: []
                  },
                  error: null
                }
              }
            ]
          }
        },
        filesystem: {
          mode: "runtime",
          input: {
            roots: [projectRoot],
            includeGlobs: ["config/**/*", "on_error/**/*"],
            excludeGlobs: [],
            maxFiles: 20,
            parseConfigFiles: true,
            includeImages: true
          }
        },
        mse: {
          mode: "runtime",
          input: {
            project: {
              project_root: projectRoot,
              interface_file: "assets/interface.json"
            },
            queries: {
              task_definitions: [],
              node_definitions: [],
              diagnostics: true
            }
          }
        },
        retrieval: {
          enabled: true,
          corpusIds: ["repo-docs"],
          queryHints: ["CoreResult", "interface.json task option"],
          limitPerQuery: 2,
          maxHits: 5
        }
      },
      {
        withReport: true
      }
    );

    expect(result.profileId).toBe("generic-maa-log");
    expect(result.rawToolResults["maa-log-analyzer"]).toBeDefined();
    expect(result.rawToolResults["filesystem"]).toBeDefined();
    expect(result.rawToolResults["maa-support-extension"]).toBeDefined();
    expect(result.rawToolResults["diagnostic-pipeline"]).toBeDefined();
    expect(result.diagnosticMeta.findings.some((item) => item.kind === "task_definition_resolved")).toBe(true);
    expect(result.diagnosticMeta.findings.some((item) => item.kind === "entry_node_resolved")).toBe(true);
    expect(result.diagnosticMeta.findings.some((item) => item.kind === "config_snapshot_available")).toBe(true);
    expect(result.diagnosticMeta.findings.some((item) => item.kind === "error_screenshot_available")).toBe(true);
    expect(result.diagnosticMeta.retrievalHits.length).toBeGreaterThan(0);
    expect(result.diagnosticMeta.profileHints.some((item) => item.kind === "recommended_tool")).toBe(true);
    expect(result.report?.format).toBe("markdown");
  });

  it("does not treat successful tasks with failed node events as a contradiction", async () => {
    const result = await runDiagnosticPipeline({
      apiVersion: "diagnostic-pipeline/v1",
      mla: {
        mode: "result",
        input: {
          results: [
            {
              tool: "parse_log_bundle",
              response: {
                request_id: "mla-session",
                api_version: "v1",
                ok: true,
                data: {
                  session_id: "session-2",
                  task_count: 1,
                  event_count: 8,
                  warnings: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            },
            {
              tool: "get_task_overview",
              response: {
                request_id: "mla-task",
                api_version: "v1",
                ok: true,
                data: {
                  task: {
                    task_id: 42,
                    entry: "AutoCollectStart",
                    status: "success",
                    duration_ms: 120000
                  },
                  summary: {
                    node_count: 12,
                    failed_node_count: 1,
                    reco_failed_count: 3
                  },
                  evidences: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            },
            {
              tool: "get_node_timeline",
              response: {
                request_id: "mla-node",
                api_version: "v1",
                ok: true,
                data: {
                  timeline: [
                    {
                      scope_id: "node-42",
                      occurrence_index: 1,
                      ts: "2026-04-16T00:00:00Z",
                      event: "Node.Action.Starting",
                      node_id: 300000637,
                      name: "AutoCollectRoute1GotoFind1",
                      source_key: "maafw.log",
                      line: 100
                    },
                    {
                      scope_id: "node-42",
                      occurrence_index: 1,
                      ts: "2026-04-16T00:01:00Z",
                      event: "Node.Action.Failed",
                      node_id: 300000637,
                      name: "AutoCollectRoute1GotoFind1",
                      source_key: "maafw.log",
                      line: 120
                    }
                  ],
                  evidences: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            }
          ]
        }
      },
      retrieval: {
        enabled: false,
        corpusIds: [],
        queryHints: [],
        limitPerQuery: 1,
        maxHits: 1
      }
    });

    expect(result.diagnosticMeta.findings.some((item) => item.kind === "task_status_conflict")).toBe(false);
  });

  it("does not mark expected recognition retries as task status conflict", async () => {
    const result = await runDiagnosticPipeline({
      apiVersion: "diagnostic-pipeline/v1",
      mla: {
        mode: "result",
        input: {
          results: [
            {
              tool: "parse_log_bundle",
              response: {
                request_id: "mla-session-2",
                api_version: "v1",
                ok: true,
                data: {
                  session_id: "session-3",
                  task_count: 1,
                  event_count: 8,
                  warnings: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            },
            {
              tool: "get_task_overview",
              response: {
                request_id: "mla-task-2",
                api_version: "v1",
                ok: true,
                data: {
                  task: {
                    task_id: 43,
                    entry: "DailyRewards",
                    status: "success",
                    duration_ms: 1000
                  },
                  summary: {
                    node_count: 5,
                    failed_node_count: 1,
                    reco_failed_count: 4
                  },
                  evidences: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            },
            {
              tool: "get_node_timeline",
              response: {
                request_id: "mla-node-2",
                api_version: "v1",
                ok: true,
                data: {
                  timeline: [
                    {
                      scope_id: "node-43",
                      occurrence_index: 1,
                      ts: "2026-04-16T00:00:00Z",
                      event: "Node.Recognition.Starting",
                      node_id: 12,
                      name: "RetryNode",
                      source_key: "maa.log",
                      line: 200
                    },
                    {
                      scope_id: "node-43",
                      occurrence_index: 1,
                      ts: "2026-04-16T00:00:01Z",
                      event: "Node.Recognition.Failed",
                      node_id: 12,
                      name: "RetryNode",
                      source_key: "maa.log",
                      line: 210
                    }
                  ],
                  evidences: []
                },
                meta: {
                  duration_ms: 1,
                  warnings: []
                },
                error: null
              }
            }
          ]
        }
      },
      retrieval: {
        enabled: false,
        corpusIds: [],
        queryHints: [],
        limitPerQuery: 1,
        maxHits: 1
      }
    });

    expect(result.diagnosticMeta.findings.some((item) => item.kind === "task_status_conflict")).toBe(false);
  });
});
