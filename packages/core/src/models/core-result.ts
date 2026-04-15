import { z } from "zod";

import { FindingSchema } from "./finding.js";
import { ObservationSchema } from "./observation.js";
import { MissingEvidenceSchema, ProfileHintSchema, RetrievalHitSchema } from "./retrieval.js";
import { RenderedReportSchema } from "./report.js";

export const DiagnosticMetaSchema = z.object({
  observations: z.array(ObservationSchema).default([]),
  findings: z.array(FindingSchema).default([]),
  retrievalHits: z.array(RetrievalHitSchema).default([]),
  profileHints: z.array(ProfileHintSchema).default([]),
  missingEvidence: z.array(MissingEvidenceSchema).default([])
});

export const RawToolResultsSchema = z.record(z.string(), z.unknown()).default({});

export const CoreResultSchema = z.object({
  apiVersion: z.literal("core/v1"),
  profileId: z.string().min(1).nullable().default(null),
  rawToolResults: RawToolResultsSchema,
  diagnosticMeta: DiagnosticMetaSchema,
  report: RenderedReportSchema.optional()
});

export type DiagnosticMeta = z.infer<typeof DiagnosticMetaSchema>;
export type RawToolResults = z.infer<typeof RawToolResultsSchema>;
export type CoreResult = z.infer<typeof CoreResultSchema>;
