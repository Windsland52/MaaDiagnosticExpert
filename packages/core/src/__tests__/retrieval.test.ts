import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  searchLocalCorpora,
  type LocalCorpusDefinition
} from "../retrieval/local.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (tempDir) => {
      await import("node:fs/promises").then(({ rm }) => rm(tempDir, { recursive: true, force: true }));
    })
  );
});

describe("local retrieval", () => {
  it("searches a local corpus deterministically", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "maa-diagnostic-core-"));
    tempDirs.push(workspaceRoot);

    await mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "docs", "guide.md"),
      [
        "# Runtime Discovery",
        "",
        "Use describe-runtime before invoking analysis commands.",
        "Search local corpus can discover repo docs.",
        "",
        "## Profiles",
        "list-builtin-profiles returns the available profile ids."
      ].join("\n"),
      "utf8"
    );

    const corpora: LocalCorpusDefinition[] = [
      {
        id: "test-guides",
        name: "Test Guides",
        description: "Temporary corpus used by unit tests.",
        rootPaths: ["docs"],
        includeGlobs: ["**/*.md"],
        tags: ["test"]
      }
    ];

    const result = await searchLocalCorpora(
      {
        apiVersion: "retrieval-query/v1",
        query: "describe-runtime analysis commands",
        corpusIds: ["test-guides"],
        limit: 3
      },
      {
        workspaceRoot,
        corpora
      }
    );

    expect(result.apiVersion).toBe("retrieval-result/v1");
    expect(result.corpusIds).toEqual(["test-guides"]);
    expect(result.stats.corpusCount).toBe(1);
    expect(result.stats.fileCount).toBe(1);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.path).toBe("docs/guide.md");
    expect(result.hits[0]?.snippet).toContain("describe-runtime");
  });
});
