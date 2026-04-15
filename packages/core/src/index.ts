export { createEmptyCoreResult, parseCoreResult } from "./factories.js";
export { buildCoreResultFromAdapterOutput, mergeAdapterOutputs } from "./results.js";
export * from "./adapters/index.js";
export {
  buildContractDocuments,
  ContractDefinitions,
  generateContractFiles,
  resolveContractsDir
} from "./contracts/definitions.js";

export {
  ConfidenceSchema,
  IdSchema,
  SeveritySchema,
  StringMapSchema,
  type Confidence,
  type Severity
} from "./models/common.js";

export {
  ReferenceKindSchema,
  ReferenceSchema,
  type Reference,
  type ReferenceKind
} from "./models/reference.js";

export { ObservationSchema, type Observation } from "./models/observation.js";

export {
  FindingSchema,
  FindingStatusSchema,
  type Finding,
  type FindingStatus
} from "./models/finding.js";

export {
  MissingEvidenceSchema,
  ProfileHintKindSchema,
  ProfileHintSchema,
  RetrievalHitSchema,
  type MissingEvidence,
  type ProfileHint,
  type ProfileHintKind,
  type RetrievalHit
} from "./models/retrieval.js";

export {
  ReportSectionSchema,
  RenderedReportSchema,
  type RenderedReport,
  type ReportSection
} from "./models/report.js";

export {
  CoreResultSchema,
  DiagnosticMetaSchema,
  RawToolResultsSchema,
  type CoreResult,
  type DiagnosticMeta,
  type RawToolResults
} from "./models/core-result.js";

export type { AdapterRunOutput, ToolAdapter } from "./adapters/types.js";

export {
  ProfileSchema,
  type Profile
} from "./profiles/schema.js";

export {
  BuiltinProfiles,
  getBuiltinProfile,
  listBuiltinProfiles
} from "./profiles/builtin.js";

export {
  loadProfileFromFile,
  requireProfile,
  resolveProfile
} from "./profiles/loader.js";

export {
  buildMarkdownReport,
  renderCoreResultMarkdown
} from "./renderers/markdown.js";

export { renderCoreResultJson } from "./renderers/json.js";
