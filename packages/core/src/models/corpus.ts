import { z } from "zod";

import { IdSchema } from "./common.js";
import { RetrievalHitSchema } from "./retrieval.js";

export const CorpusSummarySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  rootPaths: z.array(z.string().min(1)).default([]),
  includeGlobs: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([])
});

export const CorpusCatalogSchema = z.object({
  apiVersion: z.literal("corpus-catalog/v1"),
  corpora: z.array(CorpusSummarySchema).default([])
});

export const CorpusSearchInputSchema = z.object({
  apiVersion: z.literal("retrieval-query/v1"),
  query: z.string().trim().min(1),
  corpusIds: z.array(IdSchema).default([]),
  limit: z.int().min(1).max(20).default(5)
});

export const CorpusSearchStatsSchema = z.object({
  corpusCount: z.int().nonnegative(),
  fileCount: z.int().nonnegative(),
  hitCount: z.int().nonnegative()
});

export const CorpusPrepareInputSchema = z.object({
  apiVersion: z.literal("corpus-prepare/v1"),
  corpusIds: z.array(IdSchema).default([]),
  force: z.boolean().default(false)
});

export const PreparedCorpusSummarySchema = z.object({
  corpusId: IdSchema,
  cachePath: z.string().min(1),
  fileCount: z.int().nonnegative(),
  chunkCount: z.int().nonnegative()
});

export const CorpusPrepareResultSchema = z.object({
  apiVersion: z.literal("corpus-prepare-result/v1"),
  prepared: z.array(PreparedCorpusSummarySchema).default([])
});

export const CorpusSearchResultSchema = z.object({
  apiVersion: z.literal("retrieval-result/v1"),
  query: z.string().min(1),
  corpusIds: z.array(IdSchema).default([]),
  hits: z.array(RetrievalHitSchema).default([]),
  stats: CorpusSearchStatsSchema
});

export type CorpusSummary = z.infer<typeof CorpusSummarySchema>;
export type CorpusCatalog = z.infer<typeof CorpusCatalogSchema>;
export type CorpusPrepareInput = z.infer<typeof CorpusPrepareInputSchema>;
export type PreparedCorpusSummary = z.infer<typeof PreparedCorpusSummarySchema>;
export type CorpusPrepareResult = z.infer<typeof CorpusPrepareResultSchema>;
export type CorpusSearchInput = z.infer<typeof CorpusSearchInputSchema>;
export type CorpusSearchStats = z.infer<typeof CorpusSearchStatsSchema>;
export type CorpusSearchResult = z.infer<typeof CorpusSearchResultSchema>;
