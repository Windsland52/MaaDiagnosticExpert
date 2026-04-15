import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createCoreError, renderCoreErrorJson, toCoreError } from "../index.js";

describe("core errors", () => {
  it("normalizes zod errors into validation_error", () => {
    const schema = z.object({
      task_id: z.number().int()
    });

    const result = schema.safeParse({
      task_id: "bad"
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const normalized = toCoreError(result.error, {
      meta: {
        command: "test"
      }
    });

    expect(normalized.code).toBe("validation_error");
    expect(normalized.details).toHaveLength(1);
    expect(normalized.details[0]?.path).toEqual(["task_id"]);
    expect(normalized.meta.command).toBe("test");
  });

  it("normalizes missing builtin profile errors", () => {
    const normalized = toCoreError(new Error("Unknown profile: missing"));
    expect(normalized.code).toBe("profile_not_found");
    expect(normalized.retryable).toBe(false);
  });

  it("renders error JSON", () => {
    const error = createCoreError({
      code: "internal_error",
      message: "boom",
      retryable: false,
      details: [],
      meta: {
        command: "run"
      }
    });

    const rendered = renderCoreErrorJson(error);
    expect(rendered).toContain("\"apiVersion\": \"error/v1\"");
    expect(rendered).toContain("\"command\": \"run\"");
  });
});
