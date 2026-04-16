import { z } from "zod";

import {
  CoreErrorCodeSchema,
  CoreErrorSchema,
  type CoreError,
  type CoreErrorCode,
  ErrorDetailSchema,
  type ErrorDetail
} from "./models/core-error.js";

type ToCoreErrorOptions = {
  code?: CoreErrorCode;
  retryable?: boolean;
  meta?: Record<string, unknown>;
};

type ErrorWithCode = {
  code?: unknown;
  message?: unknown;
  coreCode?: unknown;
  retryable?: unknown;
  details?: unknown;
  meta?: unknown;
};

const RetryableIoCodes = new Set(["EAGAIN", "EBUSY", "EMFILE", "ENFILE"]);

function isErrorWithCode(value: unknown): value is ErrorWithCode {
  return typeof value === "object" && value !== null;
}

function readExplicitCoreCode(error: unknown): CoreErrorCode | null {
  if (!isErrorWithCode(error)) {
    return null;
  }

  const parsed = CoreErrorCodeSchema.safeParse(error.coreCode);
  return parsed.success ? parsed.data : null;
}

function inferErrorCode(error: unknown): CoreErrorCode {
  const explicit = readExplicitCoreCode(error);
  if (explicit) {
    return explicit;
  }

  if (error instanceof z.ZodError) {
    return "validation_error";
  }

  if (error instanceof Error && error.message.startsWith("Unknown profile:")) {
    return "profile_not_found";
  }

  if (isErrorWithCode(error) && typeof error.code === "string" && error.code.startsWith("E")) {
    return "io_error";
  }

  return "internal_error";
}

function inferRetryable(error: unknown, code: CoreErrorCode): boolean {
  if (isErrorWithCode(error) && typeof error.retryable === "boolean") {
    return error.retryable;
  }

  if (code !== "io_error") {
    return false;
  }

  return isErrorWithCode(error) && typeof error.code === "string"
    ? RetryableIoCodes.has(error.code)
    : false;
}

function normalizeDetails(error: unknown): ErrorDetail[] {
  if (isErrorWithCode(error) && Array.isArray(error.details)) {
    return error.details.flatMap((detail) => {
      const parsed = ErrorDetailSchema.safeParse(detail);
      return parsed.success ? [parsed.data] : [];
    });
  }

  if (!(error instanceof z.ZodError)) {
    return [];
  }

  return error.issues.map((issue) => ({
    path: issue.path.filter((segment): segment is string | number => {
      return typeof segment === "string" || typeof segment === "number";
    }),
    message: issue.message,
    code: issue.code
  }));
}

function normalizeMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown error";
}

function normalizeMeta(
  error: unknown,
  optionsMeta: Record<string, unknown> | undefined
): Record<string, unknown> {
  const errorMeta = isErrorWithCode(error) && typeof error.meta === "object" && error.meta !== null
    ? error.meta as Record<string, unknown>
    : {};

  return {
    ...errorMeta,
    ...(optionsMeta ?? {})
  };
}

export function createCoreError(input: Omit<CoreError, "apiVersion"> & { apiVersion?: "error/v1" }): CoreError {
  return CoreErrorSchema.parse({
    apiVersion: "error/v1",
    ...input
  });
}

export function toCoreError(error: unknown, options: ToCoreErrorOptions = {}): CoreError {
  const code = options.code ?? inferErrorCode(error);

  return createCoreError({
    code,
    message: normalizeMessage(error),
    retryable: options.retryable ?? inferRetryable(error, code),
    details: normalizeDetails(error),
    meta: normalizeMeta(error, options.meta)
  });
}
