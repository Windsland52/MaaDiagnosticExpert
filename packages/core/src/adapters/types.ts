import type { Finding } from "../models/finding.js";
import type { Observation } from "../models/observation.js";
import type { MissingEvidence, ProfileHint, RetrievalHit } from "../models/retrieval.js";
import type { RenderedReport } from "../models/report.js";

export type AdapterRunOutput = {
  toolName: string;
  rawResult: unknown;
  observations?: Observation[];
  findings?: Finding[];
  retrievalHits?: RetrievalHit[];
  profileHints?: ProfileHint[];
  missingEvidence?: MissingEvidence[];
  report?: RenderedReport;
};

export type ToolAdapter<TInput = unknown, TContext = unknown> = {
  id: string;
  normalize(input: TInput, context?: TContext): Promise<AdapterRunOutput> | AdapterRunOutput;
};
