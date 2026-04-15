import { z } from "zod";

import { StringMapSchema } from "./common.js";

export const CoreErrorCodeSchema = z.enum([
  "validation_error",
  "io_error",
  "profile_not_found",
  "adapter_error",
  "runtime_error",
  "unsupported_input",
  "internal_error"
]);

export const ErrorDetailPathSegmentSchema = z.union([
  z.string().min(1),
  z.number().int()
]);

export const ErrorDetailSchema = z.object({
  path: z.array(ErrorDetailPathSegmentSchema).default([]),
  message: z.string().min(1),
  code: z.string().min(1).optional()
});

export const CoreErrorSchema = z.object({
  apiVersion: z.literal("error/v1"),
  code: CoreErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  details: z.array(ErrorDetailSchema).default([]),
  meta: StringMapSchema.default({})
});

export type CoreErrorCode = z.infer<typeof CoreErrorCodeSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type CoreError = z.infer<typeof CoreErrorSchema>;
