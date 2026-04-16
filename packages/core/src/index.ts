export { createEmptyCoreResult, parseCoreResult } from "./factories.js";
export { buildCoreResultFromAdapterOutput, mergeAdapterOutputs } from "./results.js";
export * from "./adapters/index.js";
export {
  buildContractDocuments,
  ContractDefinitions,
  generateContractFiles,
  resolveContractsDir
} from "./contracts/definitions.js";
export { createCoreError, toCoreError } from "./errors.js";

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
  CorpusCatalogSchema,
  CorpusPrepareInputSchema,
  CorpusPrepareResultSchema,
  CorpusSearchInputSchema,
  CorpusSearchResultSchema,
  CorpusSearchStatsSchema,
  CorpusSummarySchema,
  type CorpusCatalog,
  type CorpusPrepareInput,
  type CorpusPrepareResult,
  type CorpusSearchInput,
  type CorpusSearchResult,
  type CorpusSearchStats,
  type PreparedCorpusSummary,
  type CorpusSummary
} from "./models/corpus.js";

export {
  DiagnosticPipelineInputSchema,
  DiagnosticMlaSourceSchema,
  DiagnosticMseSourceSchema,
  DiagnosticRetrievalConfigSchema,
  type DiagnosticMlaSource,
  type DiagnosticMseSource,
  type DiagnosticPipelineInput,
  type DiagnosticRetrievalConfig,
  type DiagnosticSourceMode
} from "./models/diagnostic-pipeline.js";

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
  CoreErrorCodeSchema,
  CoreErrorSchema,
  ErrorDetailPathSegmentSchema,
  ErrorDetailSchema,
  type CoreError,
  type CoreErrorCode,
  type ErrorDetail
} from "./models/core-error.js";

export {
  ContractSummarySchema,
  ProfileCatalogSchema,
  RuntimeInfoSchema,
  type ContractSummary,
  type ProfileCatalog,
  type RuntimeInfo
} from "./models/runtime-info.js";

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
  buildProfileCatalog,
  buildRuntimeInfo
} from "./runtime-info.js";

export {
  BuiltinCorpusDefinitions,
  buildCorpusCatalog,
  listBuiltinCorpora,
  prepareBuiltinCorpora,
  searchLocalCorpora,
  type LocalCorpusDefinition
} from "./retrieval/local.js";

export { runDiagnosticPipeline } from "./diagnostic-pipeline.js";

export {
  loadProfileFromFile,
  requireProfile,
  resolveProfile
} from "./profiles/loader.js";

export {
  buildMarkdownReport,
  renderCoreResultMarkdown
} from "./renderers/markdown.js";

export { renderCoreErrorJson } from "./renderers/error.js";
export { renderCoreResultJson } from "./renderers/json.js";
