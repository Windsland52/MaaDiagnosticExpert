import { z } from "zod";

import { StringMapSchema } from "./common.js";

export const ReferenceKindSchema = z.enum([
  "log_line",
  "source_file",
  "image",
  "url",
  "tool_result",
  "archive_entry",
  "doc_chunk"
]);

export const ReferenceSchema = z.object({
  kind: ReferenceKindSchema,
  locator: z.string().min(1),
  label: z.string().min(1).optional(),
  sourceTool: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  meta: StringMapSchema.default({})
});

export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
