import { z } from "zod";

import {
  FilesystemBatchInputSchema
} from "../adapters/filesystem.js";
import {
  FilesystemRuntimeInputSchema
} from "../adapters/filesystem-runtime.js";
import {
  MaaLogAnalyzerBatchInputSchema,
} from "../adapters/maa-log-analyzer.js";
import {
  MaaLogAnalyzerRuntimeInputSchema
} from "../adapters/maa-log-analyzer-runtime.js";
import {
  MaaSupportExtensionBatchInputSchema,
} from "../adapters/maa-support-extension.js";
import {
  MaaSupportExtensionRuntimeInputSchema
} from "../adapters/maa-support-extension-runtime.js";

const DiagnosticSourceModeSchema = z.enum(["runtime", "result"]);

export const DiagnosticMlaSourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("runtime"),
    input: MaaLogAnalyzerRuntimeInputSchema
  }),
  z.object({
    mode: z.literal("result"),
    input: MaaLogAnalyzerBatchInputSchema
  })
]);

export const DiagnosticFilesystemSourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("runtime"),
    input: FilesystemRuntimeInputSchema
  }),
  z.object({
    mode: z.literal("result"),
    input: FilesystemBatchInputSchema
  })
]);

export const DiagnosticMseSourceSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("runtime"),
    input: MaaSupportExtensionRuntimeInputSchema
  }),
  z.object({
    mode: z.literal("result"),
    input: MaaSupportExtensionBatchInputSchema
  })
]);

export const DiagnosticRetrievalConfigSchema = z.object({
  enabled: z.boolean().default(true),
  corpusIds: z.array(z.string().min(1)).default(["maafw-docs"]),
  queryHints: z.array(z.string().min(1)).default([]),
  limitPerQuery: z.int().min(1).max(10).default(5),
  maxHits: z.int().min(1).max(20).default(10)
});

export const DiagnosticPipelineInputSchema = z.object({
  apiVersion: z.literal("diagnostic-pipeline/v1"),
  profileId: z.string().min(1).nullable().optional(),
  mla: DiagnosticMlaSourceSchema.optional(),
  filesystem: DiagnosticFilesystemSourceSchema.optional(),
  mse: DiagnosticMseSourceSchema.optional(),
  retrieval: DiagnosticRetrievalConfigSchema.default(() => ({
    enabled: true,
    corpusIds: ["maafw-docs"],
    queryHints: [],
    limitPerQuery: 5,
    maxHits: 10
  }))
}).refine((input) => Boolean(input.mla || input.filesystem || input.mse), {
  message: "At least one diagnostic source is required.",
  path: ["mla"]
});

export type DiagnosticSourceMode = z.infer<typeof DiagnosticSourceModeSchema>;
export type DiagnosticMlaSource = z.infer<typeof DiagnosticMlaSourceSchema>;
export type DiagnosticFilesystemSource = z.infer<typeof DiagnosticFilesystemSourceSchema>;
export type DiagnosticMseSource = z.infer<typeof DiagnosticMseSourceSchema>;
export type DiagnosticRetrievalConfig = z.infer<typeof DiagnosticRetrievalConfigSchema>;
export type DiagnosticPipelineInput = z.infer<typeof DiagnosticPipelineInputSchema>;
