import { z } from "zod";

import { IdSchema } from "../models/common.js";

export const ProfileSchema = z.object({
  apiVersion: z.literal("profile/v1").default("profile/v1"),
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  inputs: z.object({
    acceptsRawToolResults: z.boolean().default(true),
    acceptsSourcePaths: z.boolean().default(true),
    acceptsArchives: z.boolean().default(true),
    acceptsProfiles: z.boolean().default(true)
  }).default({}),
  recommendedTools: z.array(z.string().min(1)).default([]),
  recommendedCorpora: z.array(z.string().min(1)).default([]),
  recommendedQueries: z.array(z.string().min(1)).default([]),
  reportSections: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([])
});

export type Profile = z.infer<typeof ProfileSchema>;
