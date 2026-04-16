import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ParserRuntimeModule = Pick<
  typeof import("@windsland52/maa-log-parser"),
  "createAnalyzerSessionStore" | "createAnalyzerToolHandlers"
>;

type ToolsRuntimeModule = {
  readNodeTextFileContent: (filePath: string) => Promise<string>;
  loadNodeLogDirectory: (
    inputDirectoryPath: string,
    options?: {
      focus?: {
        keywords?: string[];
        started_after?: string;
        started_before?: string;
      };
    }
  ) => Promise<{
    content: string;
    errorImages: Map<string, string>;
    visionImages: Map<string, string>;
    waitFreezesImages: Map<string, string>;
  } | null>;
  extractZipContentFromNodeFile: (
    zipFilePath: string,
    options?: {
      focus?: {
        keywords?: string[];
        started_after?: string;
        started_before?: string;
      };
    }
  ) => Promise<{
    content: string;
    errorImages: Map<string, string>;
    visionImages: Map<string, string>;
    waitFreezesImages: Map<string, string>;
  } | null>;
};

export type MlaRuntimeDependencies = ParserRuntimeModule & ToolsRuntimeModule & {
  source: string;
};

const LOCAL_MLA_ROOT_ENV = "MAA_DIAGNOSTIC_LOCAL_MLA_ROOT";

let dependencyCache: Promise<MlaRuntimeDependencies> | null = null;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  }
  catch {
    return false;
  }
}

function resolveCandidateRoots(): Array<{ root: string; explicit: boolean }> {
  const explicitRoot = process.env[LOCAL_MLA_ROOT_ENV]?.trim();
  const candidates: Array<{ root: string; explicit: boolean }> = [];
  const seenRoots = new Set<string>();

  const pushCandidate = (root: string, explicit: boolean) => {
    const normalized = path.resolve(root);
    if (seenRoots.has(normalized)) {
      return;
    }
    seenRoots.add(normalized);
    candidates.push({
      root: normalized,
      explicit
    });
  };

  if (explicitRoot) {
    pushCandidate(explicitRoot, true);
  }

  let currentDir = path.resolve(process.cwd());
  while (true) {
    pushCandidate(path.join(currentDir, "sample", "MaaLogAnalyzer"), false);
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return candidates;
}

async function tryLoadLocalDependencies(
  root: string,
  explicit: boolean
): Promise<MlaRuntimeDependencies | null> {
  const parserEntry = path.join(root, "packages", "maa-log-parser", "dist", "core", "index.js");
  const toolsEntry = path.join(root, "packages", "maa-log-tools", "dist", "nodeInput.js");

  if (!(await pathExists(parserEntry)) || !(await pathExists(toolsEntry))) {
    if (explicit) {
      throw new Error(
        `Local MaaLogAnalyzer override is missing built dist files under ${root}. Build the sample parser/tools packages first.`
      );
    }
    return null;
  }

  const [parserModule, toolsModule] = await Promise.all([
    import(pathToFileURL(parserEntry).href) as Promise<ParserRuntimeModule>,
    import(pathToFileURL(toolsEntry).href) as Promise<ToolsRuntimeModule>
  ]);

  return {
    source: `local:${root}`,
    ...parserModule,
    ...toolsModule
  };
}

async function loadPackageDependencies(): Promise<MlaRuntimeDependencies> {
  const [parserModule, toolsModule] = await Promise.all([
    import("@windsland52/maa-log-parser") as Promise<ParserRuntimeModule>,
    import("@windsland52/maa-log-tools/node-input") as unknown as Promise<ToolsRuntimeModule>
  ]);

  return {
    source: "package:@windsland52",
    ...parserModule,
    ...toolsModule
  };
}

export async function loadMlaRuntimeDependencies(): Promise<MlaRuntimeDependencies> {
  if (!dependencyCache) {
    dependencyCache = (async () => {
      for (const candidate of resolveCandidateRoots()) {
        const localDependencies = await tryLoadLocalDependencies(candidate.root, candidate.explicit);
        if (localDependencies) {
          return localDependencies;
        }
      }

      return loadPackageDependencies();
    })();
  }

  return dependencyCache;
}

export function resetMlaRuntimeDependenciesCache(): void {
  dependencyCache = null;
}
