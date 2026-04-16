import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";

import {
  CorpusCatalogSchema,
  CorpusSearchInputSchema,
  CorpusSearchResultSchema,
  type CorpusCatalog,
  type CorpusSearchInput,
  type CorpusSearchResult,
  type CorpusSummary
} from "../models/corpus.js";
import type { RetrievalHit } from "../models/retrieval.js";

export type LocalCorpusDefinition = {
  id: string;
  name: string;
  description: string;
  rootPaths: string[];
  includeGlobs: string[];
  tags: string[];
};

type SearchLocalCorporaOptions = {
  workspaceRoot?: string;
  corpora?: LocalCorpusDefinition[];
};

type ResolvedCorpusFile = {
  absolutePath: string;
  relativePath: string;
};

type SnippetMatch = {
  score: number;
  snippet: string;
  section?: string;
  title?: string;
  lineStart: number;
  lineEnd: number;
};

const MAX_SNIPPET_LINES = 3;

export const BuiltinCorpusDefinitions: readonly LocalCorpusDefinition[] = [
  {
    id: "diagnostic-guides",
    name: "Diagnostic Guides",
    description: "Project design and diagnostic workflow guides maintained inside this repository.",
    rootPaths: ["docs"],
    includeGlobs: [
      "core-domain-model.md",
      "monorepo-architecture.md",
      "package-boundaries.md",
      "quickstart-log-analysis.md"
    ],
    tags: ["docs", "diagnostic", "guides"]
  },
  {
    id: "repo-docs",
    name: "Repository Docs",
    description: "Markdown documentation stored under the repository docs directory.",
    rootPaths: ["docs"],
    includeGlobs: ["**/*.md"],
    tags: ["docs", "repo"]
  },
  {
    id: "repo-examples",
    name: "Repository Examples",
    description: "Example inputs and walkthroughs stored under the repository examples directory.",
    rootPaths: ["examples"],
    includeGlobs: ["**/*.md", "**/*.json"],
    tags: ["examples", "repo"]
  }
] as const;

function resolveRepoRoot(): string {
  return path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
}

function toCorpusSummary(definition: LocalCorpusDefinition): CorpusSummary {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    rootPaths: [...definition.rootPaths],
    includeGlobs: [...definition.includeGlobs],
    tags: [...definition.tags]
  };
}

function normalizePath(input: string): string {
  return input.split(path.sep).join("/");
}

function tokenizeQuery(query: string): string[] {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(tokens)];
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;
  while (true) {
    const index = text.indexOf(needle, fromIndex);
    if (index < 0) {
      return count;
    }

    count += 1;
    fromIndex = index + needle.length;
  }
}

function scoreText(text: string, query: string, tokens: string[]): number {
  const normalized = text.toLowerCase();
  let score = 0;

  if (query.length > 0 && normalized.includes(query)) {
    score += 12;
  }

  for (const token of tokens) {
    const occurrences = countOccurrences(normalized, token);
    if (occurrences > 0) {
      score += 3 + Math.min(occurrences - 1, 3);
    }
  }

  return score;
}

function collapseSnippet(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function findNearestHeading(lines: string[], index: number): string | undefined {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(lines[cursor]);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function findDocumentTitle(lines: string[], fallback: string): string {
  for (const line of lines) {
    const match = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return fallback;
}

function findBestSnippet(content: string, query: string, fallbackTitle: string): SnippetMatch | null {
  const tokens = tokenizeQuery(query);
  const normalizedQuery = query.trim().toLowerCase();
  const lines = content.split(/\r?\n/);
  const title = findDocumentTitle(lines, fallbackTitle);

  let bestMatch: SnippetMatch | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const windowStart = Math.max(0, index - 1);
    const windowEnd = Math.min(lines.length, windowStart + MAX_SNIPPET_LINES);
    const snippetLines = lines.slice(windowStart, windowEnd);
    const snippet = collapseSnippet(snippetLines);
    if (!snippet) {
      continue;
    }

    const score = scoreText(snippet, normalizedQuery, tokens);
    if (score <= 0) {
      continue;
    }

    const currentMatch: SnippetMatch = {
      score,
      snippet,
      section: findNearestHeading(lines, index),
      title,
      lineStart: windowStart + 1,
      lineEnd: windowEnd
    };

    if (
      bestMatch === null ||
      currentMatch.score > bestMatch.score ||
      (currentMatch.score === bestMatch.score && currentMatch.lineStart < bestMatch.lineStart)
    ) {
      bestMatch = currentMatch;
    }
  }

  return bestMatch;
}

async function resolveCorpusFiles(
  workspaceRoot: string,
  definition: LocalCorpusDefinition
): Promise<ResolvedCorpusFile[]> {
  const resolvedFiles = new Map<string, ResolvedCorpusFile>();

  for (const rootPath of definition.rootPaths) {
    const absoluteRoot = path.resolve(workspaceRoot, rootPath);
    const matches = await fg(definition.includeGlobs, {
      cwd: absoluteRoot,
      onlyFiles: true,
      unique: true
    });

    for (const match of matches) {
      const relativePath = normalizePath(path.join(rootPath, match));
      resolvedFiles.set(relativePath, {
        absolutePath: path.resolve(absoluteRoot, match),
        relativePath
      });
    }
  }

  return [...resolvedFiles.values()].sort((left, right) => {
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function resolveSelectedCorpora(
  allCorpora: readonly LocalCorpusDefinition[],
  corpusIds: string[]
): LocalCorpusDefinition[] {
  if (corpusIds.length === 0) {
    return [...allCorpora];
  }

  const selected: LocalCorpusDefinition[] = [];
  for (const corpusId of corpusIds) {
    const corpus = allCorpora.find((item) => item.id === corpusId);
    if (!corpus) {
      throw new Error(`Unknown corpus: ${corpusId}`);
    }

    selected.push(corpus);
  }

  return selected;
}

function toRetrievalHit(
  corpusId: string,
  relativePath: string,
  match: SnippetMatch
): RetrievalHit {
  return {
    id: `${corpusId}:${relativePath}:${match.lineStart}`,
    corpus: corpusId,
    path: relativePath,
    title: match.title,
    section: match.section,
    score: Number(match.score.toFixed(2)),
    snippet: match.snippet,
    tags: [],
    metadata: {
      lineStart: String(match.lineStart),
      lineEnd: String(match.lineEnd)
    }
  };
}

export function buildCorpusCatalog(
  corpora: readonly LocalCorpusDefinition[] = BuiltinCorpusDefinitions
): CorpusCatalog {
  return CorpusCatalogSchema.parse({
    apiVersion: "corpus-catalog/v1",
    corpora: corpora.map(toCorpusSummary)
  });
}

export function listBuiltinCorpora(): CorpusSummary[] {
  return buildCorpusCatalog().corpora;
}

export async function searchLocalCorpora(
  input: CorpusSearchInput,
  options: SearchLocalCorporaOptions = {}
): Promise<CorpusSearchResult> {
  const parsedInput = CorpusSearchInputSchema.parse(input);
  const workspaceRoot = options.workspaceRoot ?? resolveRepoRoot();
  const corpora = resolveSelectedCorpora(
    options.corpora ?? BuiltinCorpusDefinitions,
    parsedInput.corpusIds
  );

  const hits: RetrievalHit[] = [];
  let fileCount = 0;

  for (const corpus of corpora) {
    const files = await resolveCorpusFiles(workspaceRoot, corpus);
    fileCount += files.length;

    for (const file of files) {
      const content = await readFile(file.absolutePath, "utf8");
      const match = findBestSnippet(
        content,
        parsedInput.query,
        path.basename(file.relativePath)
      );
      if (!match) {
        continue;
      }

      hits.push(toRetrievalHit(corpus.id, file.relativePath, match));
    }
  }

  hits.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.corpus !== right.corpus) {
      return left.corpus.localeCompare(right.corpus);
    }

    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }

    return String(left.metadata.lineStart).localeCompare(String(right.metadata.lineStart));
  });

  return CorpusSearchResultSchema.parse({
    apiVersion: "retrieval-result/v1",
    query: parsedInput.query,
    corpusIds: corpora.map((corpus) => corpus.id),
    hits: hits.slice(0, parsedInput.limit),
    stats: {
      corpusCount: corpora.length,
      fileCount,
      hitCount: hits.length
    }
  });
}
