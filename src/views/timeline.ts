import { UsageError, type InspectionResult } from "../evidence/index.js";

export const TASK_TIMELINE_SCHEMA_VERSION = "maa-evidence-task-timeline/v1" as const;

export type TaskTimelineEvent = "success" | "failed" | "running" | "timeout" | "action-failed";

export type TaskTimelineEntry = {
  ts: string;
  event: TaskTimelineEvent;
  node: string;
  matched?: string;
};

export type TaskTimelineTask = {
  executionId: string;
  taskId: number;
  name: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  endedAt: string | null;
  entries: TaskTimelineEntry[];
};

export type TaskTimelineView = {
  schemaVersion: typeof TASK_TIMELINE_SCHEMA_VERSION;
  kind: InspectionResult["kind"];
  inspectionGeneratedAt: string;
  tasks: TaskTimelineTask[];
};

export type TaskTimelineFormat = "json" | "text";

export type TaskTimelineOptions = {
  tasks?: string[];
};

type RawTimelineTask = {
  executionId?: unknown;
  taskId?: unknown;
  name?: unknown;
  status?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  entries?: unknown;
};

function isTaskTimelineStatus(value: unknown): value is TaskTimelineTask["status"] {
  return value === "running" || value === "succeeded" || value === "failed";
}

function isTaskTimelineEvent(value: string): value is TaskTimelineEvent {
  return value === "success" || value === "failed" || value === "running"
    || value === "timeout" || value === "action-failed";
}

function parseTimelineTask(value: unknown): TaskTimelineTask | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as RawTimelineTask;
  if (
    typeof raw.executionId !== "string"
    || typeof raw.taskId !== "number"
    || typeof raw.name !== "string"
    || !isTaskTimelineStatus(raw.status)
    || typeof raw.startedAt !== "string"
    || !(raw.endedAt === null || typeof raw.endedAt === "string")
    || !Array.isArray(raw.entries)
  ) {
    return undefined;
  }
  const entries: TaskTimelineEntry[] = [];
  for (const item of raw.entries) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as { ts?: unknown; event?: unknown; node?: unknown; matched?: unknown };
    if (
      typeof entry.ts !== "string"
      || typeof entry.event !== "string"
      || !isTaskTimelineEvent(entry.event)
      || typeof entry.node !== "string"
    ) {
      continue;
    }
    entries.push({
      ts: entry.ts,
      event: entry.event,
      node: entry.node,
      ...(typeof entry.matched === "string" ? { matched: entry.matched } : {}),
    });
  }
  return {
    executionId: raw.executionId,
    taskId: raw.taskId,
    name: raw.name,
    status: raw.status,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    entries,
  };
}

function inspectionTaskTimelines(result: InspectionResult): TaskTimelineTask[] {
  const details = result.details as {
    taskTimelines?: unknown;
    mla?: { details?: { taskTimelines?: unknown } } | null;
  };
  const raw = result.kind === "mla"
    ? details.taskTimelines
    : result.kind === "combined"
      ? details.mla?.details?.taskTimelines
      : undefined;
  if (!Array.isArray(raw)) {
    if (result.kind === "mla" || result.kind === "combined") {
      throw new UsageError(
        "Task timelines are missing from this inspection; regenerate it with a current mla inspect.",
      );
    }
    throw new UsageError(`Task timelines are only available for MLA inspections: ${result.kind}`);
  }
  return raw.map(parseTimelineTask).filter((task): task is TaskTimelineTask => task !== undefined);
}

export function taskTimeline(
  result: InspectionResult,
  options: TaskTimelineOptions = {},
): TaskTimelineView {
  const selected = options.tasks === undefined || options.tasks.length === 0
    ? undefined
    : new Set(options.tasks);
  const tasks = inspectionTaskTimelines(result)
    .filter((task) => selected === undefined || selected.has(task.name));
  return {
    schemaVersion: TASK_TIMELINE_SCHEMA_VERSION,
    kind: result.kind,
    inspectionGeneratedAt: result.generatedAt,
    tasks,
  };
}

function renderTimelineText(view: TaskTimelineView): string {
  const lines = [
    `MaaEvidenceKit task timeline (${view.kind} inspection generated ${view.inspectionGeneratedAt})`,
  ];
  for (const task of view.tasks) {
    const endedAt = task.endedAt ?? "still running";
    lines.push(
      `Task ${task.name} [${task.status}] ${task.startedAt} .. ${endedAt} (${task.executionId})`,
    );
    for (const entry of task.entries) {
      const matched = entry.matched === undefined ? "" : ` <- ${entry.matched}`;
      lines.push(`  ${entry.ts}  ${entry.event.padEnd(13)} ${entry.node}${matched}`);
    }
  }
  return lines.join("\n");
}

export function renderTaskTimeline(
  result: InspectionResult,
  format: TaskTimelineFormat = "json",
  options: TaskTimelineOptions = {},
): string {
  const view = taskTimeline(result, options);
  return format === "json" ? JSON.stringify(view, null, 2) : renderTimelineText(view);
}
