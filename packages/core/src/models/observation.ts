import { z } from "zod";

import { IdSchema, SeveritySchema, StringMapSchema } from "./common.js";
import { ReferenceSchema } from "./reference.js";

export const ObservationSchema = z.object({
  id: IdSchema,
  kind: z.string().min(1),
  summary: z.string().min(1),
  sourceTool: z.string().min(1).optional(),
  severity: SeveritySchema.default("info"),
  payload: StringMapSchema.default({}),
  tags: z.array(z.string().min(1)).default([]),
  references: z.array(ReferenceSchema).default([])
});

export type Observation = z.infer<typeof ObservationSchema>;
