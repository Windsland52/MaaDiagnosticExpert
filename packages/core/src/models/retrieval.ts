import { z } from "zod";

import { IdSchema, StringMapSchema } from "./common.js";

export const RetrievalHitSchema = z.object({
  id: IdSchema,
  corpus: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  score: z.number().finite(),
  snippet: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  metadata: StringMapSchema.default({})
});

export const ProfileHintKindSchema = z.enum([
  "recommended_tool",
  "recommended_corpus",
  "recommended_query",
  "report_template",
  "note"
]);

export const ProfileHintSchema = z.object({
  kind: ProfileHintKindSchema,
  value: z.string().min(1),
  reason: z.string().min(1).optional()
});

export const MissingEvidenceSchema = z.object({
  id: IdSchema,
  description: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  suggestedActions: z.array(z.string().min(1)).default([])
});

export type RetrievalHit = z.infer<typeof RetrievalHitSchema>;
export type ProfileHintKind = z.infer<typeof ProfileHintKindSchema>;
export type ProfileHint = z.infer<typeof ProfileHintSchema>;
export type MissingEvidence = z.infer<typeof MissingEvidenceSchema>;
