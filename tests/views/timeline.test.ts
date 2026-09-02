import { expect, test } from "vitest";

import { EVIDENCE_SCHEMA_VERSION, renderTaskTimeline, taskTimeline } from "../../src/index.js";
import type { InspectionResult } from "../../src/index.js";

function mlaResult(): InspectionResult {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: "mla",
    generatedAt: "2026-09-01T00:00:00.000Z",
    input: { path: "C:/materials" },
    artifacts: [],
    evidence: [],
    missingEvidence: [],
    warnings: [],
    statistics: {},
    details: {
      runtime: { sessions: [], unscoped_tasks: [], failures: [], outcomes: [], signals: [] },
      taskTimelines: [
        {
          executionId: "maa:1",
          taskId: 1,
          name: "Combat",
          status: "failed",
          startedAt: "2026-07-19 10:01:00.000",
          endedAt: "2026-07-19 10:01:03.000",
          entries: [
            { ts: "2026-07-19 10:01:01.000", event: "success", node: "Enter" },
            { ts: "2026-07-19 10:01:02.000", event: "action-failed", node: "Swipe", matched: "Target" },
            { ts: "2026-07-19 10:01:03.000", event: "timeout", node: "Fallback" },
          ],
        },
        {
          executionId: "maa:2",
          taskId: 2,
          name: "Collect",
          status: "succeeded",
          startedAt: "2026-07-19 11:01:00.000",
          endedAt: null,
          entries: [],
        },
      ],
    },
  };
}

test("renders the task timeline as JSON with tasks and entries", () => {
  const parsed = JSON.parse(renderTaskTimeline(mlaResult(), "json"));

  expect(parsed.schemaVersion).toBe("maa-evidence-task-timeline/v1");
  expect(parsed.kind).toBe("mla");
  expect(parsed.tasks).toHaveLength(2);
  expect(parsed.tasks[0].entries[1]).toEqual({
    ts: "2026-07-19 10:01:02.000",
    event: "action-failed",
    node: "Swipe",
    matched: "Target",
  });
});

test("renders a text timeline with one time/event/node row per entry", () => {
  const text = renderTaskTimeline(mlaResult(), "text");

  expect(text).toContain("MaaEvidenceKit task timeline (mla inspection generated 2026-09-01T00:00:00.000Z)");
  expect(text).toContain("Task Combat [failed] 2026-07-19 10:01:00.000 .. 2026-07-19 10:01:03.000 (maa:1)");
  expect(text).toContain("2026-07-19 10:01:01.000  success       Enter");
  expect(text).toContain("2026-07-19 10:01:02.000  action-failed Swipe <- Target");
  expect(text).toContain("2026-07-19 10:01:03.000  timeout       Fallback");
  expect(text).toContain("Task Collect [succeeded] 2026-07-19 11:01:00.000 .. still running (maa:2)");
});

test("filters timelines by task name", () => {
  const view = taskTimeline(mlaResult(), { tasks: ["Combat"] });

  expect(view.tasks.map((task) => task.name)).toEqual(["Combat"]);
});

test("extracts the timeline from the MLA part of a combined inspection", () => {
  const combined = {
    ...mlaResult(),
    kind: "combined" as const,
    details: {
      mla: mlaResult(),
      mse: null,
      correlation: { runtimeNodes: { total: 0, selected: 0, omitted: 0, failureNodes: 0, recognitionOnlyNodes: 0 } },
    },
  };

  expect(taskTimeline(combined).tasks.map((task) => task.name)).toEqual(["Combat", "Collect"]);
});

test("rejects timelines for inspections without MLA details", () => {
  const mse = {
    ...mlaResult(),
    kind: "mse" as const,
    details: {},
  };

  expect(() => taskTimeline(mse)).toThrow("Task timelines are only available for MLA inspections: mse");
});

test("explains that MLA inspections without timelines need regeneration", () => {
  const older = {
    ...mlaResult(),
    details: { runtime: { sessions: [], unscoped_tasks: [], failures: [], outcomes: [], signals: [] } },
  };

  expect(() => taskTimeline(older)).toThrow(
    "Task timelines are missing from this inspection; regenerate it with a current mla inspect.",
  );
});

test("drops entries whose event is not a known timeline event", () => {
  const tampered = {
    ...mlaResult(),
    details: {
      runtime: { sessions: [], unscoped_tasks: [], failures: [], outcomes: [], signals: [] },
      taskTimelines: [
        {
          executionId: "maa:1",
          taskId: 1,
          name: "Combat",
          status: "failed",
          startedAt: "2026-07-19 10:01:00.000",
          endedAt: "2026-07-19 10:01:03.000",
          entries: [
            { ts: "2026-07-19 10:01:01.000", event: "success", node: "Enter" },
            { ts: "2026-07-19 10:01:04.000", event: "banana", node: "Spoiled" },
          ],
        },
      ],
    },
  };

  expect(taskTimeline(tampered).tasks[0]?.entries.map((entry) => entry.node)).toEqual(["Enter"]);
});
