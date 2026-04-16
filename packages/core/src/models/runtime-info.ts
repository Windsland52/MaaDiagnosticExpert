import { z } from "zod";

import { IdSchema } from "./common.js";
import { ProfileSchema } from "../profiles/schema.js";

export const ContractSummarySchema = z.object({
  name: IdSchema,
  filename: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  schemaId: z.string().min(1)
});

export const RuntimeInfoSchema = z.object({
  apiVersion: z.literal("runtime/v1"),
  runtimeName: z.string().min(1),
  runtimeVersion: z.string().min(1),
  commands: z.array(z.string().min(1)).default([]),
  adapters: z.array(z.string().min(1)).default([]),
  builtinProfileIds: z.array(IdSchema).default([]),
  builtinCorpusIds: z.array(IdSchema).default([]),
  contracts: z.array(ContractSummarySchema).default([])
});

export const ProfileCatalogSchema = z.object({
  apiVersion: z.literal("profile-catalog/v1"),
  profiles: z.array(ProfileSchema).default([])
});

export type ContractSummary = z.infer<typeof ContractSummarySchema>;
export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>;
export type ProfileCatalog = z.infer<typeof ProfileCatalogSchema>;
