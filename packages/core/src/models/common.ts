import { z } from "zod";

export const IdSchema = z.string().min(1);

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const SeveritySchema = z.enum(["info", "warning", "error"]);

export const StringMapSchema = z.record(z.string(), z.unknown());

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
