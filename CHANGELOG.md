# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-09-03

### Added

- Add a per-task compressed node timeline to MLA inspections as `details.taskTimelines`
  (`maa-evidence-task-timeline/v1`), built through the pinned maa-log-tools node execution timeline.
  Each execution carries `time, event, node, matched recognition` entries classified into `success`,
  `failed`, `running`, recognition `timeout`, and `action-failed`, so a harness no longer rebuilds
  node sequences from raw logs. Task ids restart across framework sessions inside one bundle, so
  kernel timelines correlate to runtime executions by `(task_id, start_time)` instead of a task-id
  map that silently kept only the last occurrence, and the correlation stays correct under
  time-range focus. The new `maa-evidence timeline` command renders the timeline as JSON or text
  with an optional `--task` filter; non-MLA inspections are rejected as usage errors, and unknown
  timeline events are dropped at the view boundary.
- Embed a bounded `notableEvidence` block in inspection summaries: up to ten evidence identities
  per actionable kind (`mla.task_anomaly`, `mla.outcome` with failures first, cycle exit blockers,
  mirrored task groups, repeated node segments) plus `total`/`omitted`, deterministic in evidence
  order. Summaries previously reported these kinds only as statistics counts, forcing a discovery
  search round trip before any `view --evidence-id` follow-up.
- Export `UsageError` and `errnoCode` through the SDK facade so SDK consumers can distinguish
  caller-input failures from operational failures and classify them the same way operational
  telemetry does.

### Changed

- `--output` now always receives the complete inspection document, and `--summary` only decides
  what stdout shows. `mla inspect --summary --output F` previously wrote the bounded summary into
  F, which `view`/`search`/`window` cannot consume and which forced a second full inspection; one
  run now both bounds the first read and keeps the saved report drillable.
- Make usage errors actionable and classify them as `invalid_input`: missing input paths, missing
  inspection files, and missing `--output` directories fail with messages that name the offending
  path instead of raw `ENOENT` text, directory inputs and outputs are rejected explicitly, and
  caller-input validation (CLI argument checks, batch request parsing, unknown evidence IDs,
  archive and directory guards) throws `UsageError`. Operational telemetry classifies these
  expected failures as `invalid_input` instead of the `operation_failed` fallback; the operational
  telemetry schema version is bumped to 3 for the changed `error_category` semantics.

## [0.5.0] - 2026-09-01

### Added

- Match `mla.pipeline_override` target nodes in evidence search. `--node` previously covered only the
  top-level source node and retained recognition children, so an override that configured a node was
  unreachable by the node the harness was investigating, even though the record already carried
  `nodeNames`. Matches report the new `pipeline_override` relation.
- Export `patchPaths` on `mla.pipeline_override` evidence: a bounded, sorted, de-duplicated list of
  the overridden fields as `Node.field.subfield` strings. Override payloads carry their meaning in
  object keys, and evidence text search deliberately does not match JSON field names, so the field a
  run actually set was previously unsearchable. Paths are capped at 200 entries and depth 8, and
  `patchPathsTruncated` is set only when a path is actually dropped.
- Add `--summary` to the inspection commands and `summarizeInspection`/`renderInspectionSummary` to
  the SDK. The summary is a separate `maa-evidence-summary/v1` document holding artifacts, missing
  evidence, warnings, statistics, and the available evidence kinds with their counts, without the
  evidence ledger or the details payload that dominate a full result.
- Report identical observations that repeat across mirrored artifacts through the new
  `mla_cross_artifact_duplicate_observations` warning and the
  `crossArtifactDuplicateObservations` statistic. Records keep separate provenance and stay
  unmerged; the warning names the artifacts so a harness does not read one event as two.
- Suggest the closest known option when the CLI rejects an unknown one, including the common
  `--json`/`--text`/`--mermaid` mistake for `--format <value>`.

### Changed

- Document narrowing a known incident window with `--from`/`--to` and starting from `--summary` in
  the CLI reference, the README, and the host-agent Skill.

## [0.4.0] - 2026-09-01

### Added

- Bound how many files a directory target may contribute before it is handed to the upstream
  directory loader. `@windsland52/maa-log-tools` 2.0.0 removed its own entry-count limit, so an
  oversized directory now fails that single target with an explicit reason and falls back to the
  individually discovered log files, instead of walking the directory unbounded.

### Changed

- Update `@windsland52/maa-log-tools` to 2.0.0. That release removes `ArchiveLimits.maxEntries` and
  the `entry-count` `ArchiveLimitCode` from the public surface, and `loadNodeLogDirectory` no longer
  caps how many entries a directory may contribute. MEK never configured that limit, so no call site
  changed; artifact discovery stays bounded by MEK's own scanned-file limit, while the directory read
  inside the upstream loader is now bounded only by its byte budgets.
- Update `@nekosu/maa-pipeline-manager` to 1.0.14, which fixes content watching on macOS by using
  polling and moves the transitive `@nekosu/maa-locale` to 1.1.0. `@nekosu/maa-tasker` is already
  current and stays pinned to 1.0.0.
- Extend the host-agent Skill's Sentry reference with release-health triage: obtain a per-release
  session denominator before comparing versions, separate telemetry-schema and tag-coverage changes
  from real regressions, correlate a suspected regression with the application's own issue-time tag
  history, sample custom event context instead of assuming it is queryable, and verify Sentry CLI
  aggregates before ranking or quantifying with them.
- Route release or version health questions in the Skill entry point to the population-first Sentry
  path instead of the Issue-driven MLA/MSE path.

## [0.3.2] - 2026-08-12

### Added

- Add a random, locally stored anonymous installation identity for estimating active installations
  and command frequency without deriving an identifier from hardware or operating-system accounts.
- Add queryable telemetry schema, duration/evidence buckets, and deterministic error category/stage
  tags with versioned Sentry releases.

### Fixed

- Disable operational telemetry in MEK's own tests and release workflows so development failures
  do not inflate usage or failure counts.

## [0.3.1] - 2026-08-12

### Added

- Add an explicit `repo-docs` CLI/SDK inspection kind that exports bounded, source-backed
  `AGENTS.md` evidence and deterministic `SKILL.md` path structure without parsing or activating
  repository skills.

### Fixed

- Discover common image formats by file signature when an attachment has no filename extension.
- Constrain repository-document discovery with deterministic ordering, fixed scan/depth/list/text
  limits, checkout confinement, symbolic-link rejection, and authorized evidence windows.

### Changed

- Generalize the host Skill's Sentry and OCR triage guidance, keeping project-specific failure
  explanations conditional and evidence-backed.
- Add an on-demand host reporting template that separates reported symptoms, observed mechanisms,
  suspected triggers, evidence gaps, user guidance, and repair handoffs without exposing internal
  reasoning or partial drafts.

## [0.3.0] - 2026-08-11

### Added

- Search retained direct-child and descendant recognition nodes by exact name, with the matching
  relation and nested recognition path included in each result.

### Fixed

- Report a failed combined-directory MLA load as an explicit fallback warning when individual log
  inspection remains available, without duplicating the same file as directory-level missing
  evidence.
- Include the linked task status and nearby-failure count in failure-context summaries so a
  succeeded root task does not hide adjacent failed subtasks.

### Changed

- Refine the host-agent Skill to gather evidence progressively, identify exact or prefix-overlapping
  issue exports before counting reproductions, and keep original Sentry groups separate from
  host-inferred signature families.
- State explicitly that application Sentry queries and diagnostic interpretation remain external
  harness responsibilities; MEK does not receive application Sentry credentials.

## [0.2.0] - 2026-08-11

### Added

- Add a use-time updater that rate-limits npm checks, hands commands to a newer exact stable
  runtime, and delegates cross-Agent Skill synchronization to the `skills` CLI with offline and CI
  fallbacks.
- Extract ordered MaaFramework pipeline override evidence with conservative Context-to-task
  correlation, explicit truncation, and parse-completeness reporting.
- Link runtime failure nodes to both MSE base-definition evidence and exact task-scoped override
  evidence without presenting a generic JSON merge as the final runtime configuration.
- Add bounded failure-centered task chronology with stable task, failure, and failure-image evidence
  references.
- Compare direct static OCR expected values and ROIs with bounded source-backed runtime observations
  using explicit literal and geometry-only semantics.

### Changed

- Update `@nekosu/maa-pipeline-manager` to 1.0.13; `@nekosu/maa-tasker` remains pinned to its latest
  1.0.0 release.
- Update MaaLogAnalyzer tooling to retain nested-task runtime failures and their image evidence.
- Install the hosted Skill as a remotely managed global Skill so its installer, rather than MEK,
  owns Agent-specific paths and update targets.
- Expand the harness Skill's configuration workflow to distinguish static declarations, runtime
  override inputs, framework execution facts, and observed application state.

## [0.1.1] - 2026-08-08

### Fixed

- Resolve CLI entrypoint symlinks before comparing module URLs so globally installed commands run
  correctly through package-manager shims.

### Changed

- Add a portable TypeScript build command for environments without native TypeScript 7 support.
- Include the detailed CLI, SDK, and evidence-model documentation in the published package.

## [0.1.0] - 2026-08-07

### Added

- Initial public TypeScript SDK and `maa-evidence` CLI for deterministic MaaFramework evidence.
- MaaFramework log discovery, task/session/failure facts, cycle analysis, recognition and action
  evidence, bounded source windows, and image-reference metadata.
- Generic OCR, template, color, direct-child, and nested-recognition extraction with explicit
  completeness and truncation fields.
- Public MSE project preflight, focused task resolution, static node/reference graphs, and source
  locations through pinned public MSE packages.
- Combined runtime-to-static failure and recognition relations with explicit resolution status.
- JSON, text, and Mermaid views plus evidence `search`, `view`, `window`, and `batch` workflows.
- Local performance profiles, default aggregate operational telemetry with opt-out, and explicitly
  confirmed original-material feedback.
- Host-agent Skill describing evidence-first issue-analysis workflows and MEK/harness boundaries.

### Security

- Project-root confinement for MSE reads and inventoried-artifact confinement for evidence windows.
- Whitelist-only operational telemetry, disabled default PII, and mandatory preview/confirmation for
  feedback attachments.

[Unreleased]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Windsland52/MaaEvidenceKit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Windsland52/MaaEvidenceKit/releases/tag/v0.1.0
