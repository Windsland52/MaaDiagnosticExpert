import { z } from "zod";

import { ConfidenceSchema, IdSchema } from "./common.js";
import { ReferenceSchema } from "./reference.js";

export const FindingStatusSchema = z.enum([
  "confirmed",
  "likely",
  "possible",
  "rejected"
]);

export const FindingSchema = z.object({
  id: IdSchema,
  kind: z.string().min(1),
  statement: z.string().min(1),
  status: FindingStatusSchema.default("likely"),
  confidence: ConfidenceSchema,
  basisObservationIds: z.array(IdSchema).default([]),
  supportingReferences: z.array(ReferenceSchema).default([]),
  gaps: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([])
});

export type FindingStatus = z.infer<typeof FindingStatusSchema>;
export type Finding = z.infer<typeof FindingSchema>;
