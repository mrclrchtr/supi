/**
 * Likely test file discovery for impact analysis.
 *
 * Extracted from generate-impact.ts to keep impact orchestration focused.
 * Combines direct test-file detection, semantic reference-based discovery,
 * and path conventions to find companion test files for affected source files.
 */

import * as path from "node:path";
import type { CodePosition } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../../analysis/context/request-context.ts";
import {
  type DiscoveredTestFile,
  describeTestFile,
  discoverTestFilesForSource,
  isTestFilePath,
} from "../../analysis/relations/tests.ts";

export interface ChangeSetFileEntry {
  absPath: string;
  relPath: string;
}

export type TestAnchorMap = Map<string, CodePosition[]>;

export interface LikelyTestsResult {
  paths: string[];
  files: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">>;
  provenance?: "semantic+conventions" | "conventions-only";
}

export function buildTestAnchorMap(
  entries: Array<{ file: string; position: CodePosition }>,
): TestAnchorMap {
  const map: TestAnchorMap = new Map();
  for (const entry of entries) {
    const key = path.resolve(entry.file);
    const positions = map.get(key) ?? [];
    positions.push(entry.position);
    map.set(key, positions);
  }
  return map;
}

export function normalizeChangeSet(files: string[], cwd: string): ChangeSetFileEntry[] {
  const seen = new Set<string>();
  const result: ChangeSetFileEntry[] = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    const relPath = path.relative(cwd, absPath) || file;
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    result.push({ absPath, relPath });
  }

  return result;
}

function dedupeDiscoveredTestFiles(
  files: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">>,
): Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">> {
  const byPath = new Map<
    string,
    Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">
  >();

  for (const file of files) {
    const existing = byPath.get(file.absPath);
    if (!existing) {
      byPath.set(file.absPath, file);
      continue;
    }

    if (existing.labelStatus !== "recognized" && file.labelStatus === "recognized") {
      byPath.set(file.absPath, file);
    }
  }

  return [...byPath.values()].sort((left, right) => left.absPath.localeCompare(right.absPath));
}

// biome-ignore lint/complexity/useMaxParams: shared likely-test collection keeps evidence inputs explicit
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: discovery aggregation across direct tests, semantic references, and conventions is clearest in one helper
export async function collectLikelyTests(
  affectedFiles: Set<string>,
  cwd: string,
  references: CodeProvider["references"] | undefined,
  testAnchors?: TestAnchorMap,
  fallbackProvenance?: "semantic+conventions" | "conventions-only",
  outline?: CodeProvider["outline"],
): Promise<LikelyTestsResult> {
  const seen = new Set<string>();
  const likelyTests: string[] = [];
  const discoveredFiles: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">> =
    [];
  let provenance = fallbackProvenance;

  for (const affFile of affectedFiles) {
    if (isTestFilePath(affFile)) {
      addLikelyTestPath(cwd, affFile, seen, likelyTests);
      const described = await describeTestFile(affFile, { outline, cwd });
      discoveredFiles.push(described);
      continue;
    }

    const positions = testAnchors?.get(path.resolve(affFile)) ?? [];
    const discoveries =
      positions.length > 0
        ? await Promise.all(
            positions.map((position) =>
              discoverTestFilesForSource(affFile, {
                cwd,
                cap: 3,
                references,
                outline,
                position,
              }),
            ),
          )
        : [
            await discoverTestFilesForSource(affFile, {
              cwd,
              cap: 3,
              references,
              outline,
            }),
          ];

    for (const discovery of discoveries) {
      if (discovery.kind !== "found") continue;
      if (discovery.provenance === "semantic+conventions") {
        provenance = "semantic+conventions";
      } else if (!provenance) {
        provenance = discovery.provenance;
      }
    }

    const discovered = dedupeDiscoveredTestFiles(discoveries.flatMap((entry) => entry.files));
    for (const testFile of discovered) {
      addLikelyTestPath(cwd, testFile.absPath, seen, likelyTests);
      discoveredFiles.push(testFile);
    }
  }

  const files = dedupeDiscoveredTestFiles(discoveredFiles).slice(0, 3);
  likelyTests.sort((a, b) => a.localeCompare(b));
  return { paths: likelyTests.slice(0, 3), files, provenance };
}

function addLikelyTestPath(
  cwd: string,
  absPath: string,
  seen: Set<string>,
  likelyTests: string[],
): void {
  const relPath = path.relative(cwd, absPath) || absPath;
  if (seen.has(relPath)) return;
  seen.add(relPath);
  likelyTests.push(relPath);
}

import { detectVitestWorkspace, VITEST_RUNNABLE_EXTENSIONS } from "./vitest-detection.ts";

export function buildLikelyTestCommands(cwd: string, likelyTests: string[]): string[] {
  if (likelyTests.length === 0 || !detectVitestWorkspace(cwd)) {
    return [];
  }

  return likelyTests
    .filter((testPath) => VITEST_RUNNABLE_EXTENSIONS.has(path.extname(testPath)))
    .slice(0, 3)
    .map((relTest) => `pnpm vitest run ${relTest} --reporter=verbose`);
}
