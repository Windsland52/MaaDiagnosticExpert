import { z } from "zod";

export const ReportSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string()
});

export const RenderedReportSchema = z.object({
  format: z.enum(["markdown", "json"]),
  title: z.string().min(1).optional(),
  sections: z.array(ReportSectionSchema).default([]),
  body: z.string().default("")
});

export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type RenderedReport = z.infer<typeof RenderedReportSchema>;
