/**
 * Shared test-file discovery helpers.
 *
 * Used by both `code_context` and `code_graph` to find companion test files
 * and extract test function names via tree-sitter outline.
 */

import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

/**
 * Find companion test files for a given source file (absolute path).
 * Returns absolute paths to existing test files.
 *
 * Strategy:
 * 1. Fast path: direct naming convention (same stem, __tests__/ sibling)
 * 2. Fallback: scan __tests__/ directories recursively for test files
 *    that import from the target source file
 */
export function findTestCompanionFiles(targetAbs: string): string[] {
  const ext = path.extname(targetAbs);
  const stem = targetAbs.slice(0, ext.length > 0 ? -ext.length : undefined);
  const dir = path.dirname(targetAbs);
  const base = path.basename(stem);

  // Fast path: direct naming convention
  const candidates = [
    `${stem}.test${ext}`,
    `${stem}.spec${ext}`,
    path.join(dir, "__tests__", `${base}.test${ext}`),
    path.join(dir, "__tests__", `${base}.spec${ext}`),
  ];
  const directMatches = candidates.filter((candidate) => existsSync(candidate));
  if (directMatches.length > 0) {
    return directMatches;
  }

  // Fallback: scan __tests__/ directories for test files that might reference this source
  return findTestFilesInNearestTestsDir(targetAbs, dir, ext);
}

/**
 * Scan __tests__/ directories near the source file for test files.
 * Walks up to 3 levels looking for __tests__/ dirs, then checks for
 * .test.* or .spec.* files that might be companions.
 */
function findTestFilesInNearestTestsDir(
  targetAbs: string,
  startDir: string,
  ext: string,
): string[] {
  const maxDepth = 3;
  const testExts = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".test.js", ".spec.js"];
  const targetBase = path.basename(targetAbs, ext);

  let currentDir = startDir;
  for (let depth = 0; depth <= maxDepth; depth++) {
    const testsDir = path.join(currentDir, "__tests__");
    if (existsSync(testsDir)) {
      const found = scanTestsDirForCompanions(testsDir, targetBase, testExts, 2);
      if (found.length > 0) {
        return found;
      }
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return [];
}

/**
 * Recursively scan a __tests__/ directory for test files that might be companions.
 * Matches files where the stem contains the target base name (fuzzy match).
 */
function scanTestsDirForCompanions(
  testsDir: string,
  targetBase: string,
  testExts: string[],
  maxDepth: number,
): string[] {
  const results: string[] = [];
  const maxFiles = 10; // Cap to avoid expensive scans

  try {
    scanDir(testsDir, { depth: 0, maxDepth, maxFiles, targetBase, testExts, results });
  } catch {
    // Ignore scan errors
  }

  return results;
}

interface ScanDirOptions {
  depth: number;
  maxDepth: number;
  maxFiles: number;
  targetBase: string;
  testExts: string[];
  results: string[];
}

function scanDir(dir: string, opts: ScanDirOptions): void {
  if (opts.depth > opts.maxDepth || opts.results.length >= opts.maxFiles) return;

  const entries = readDirEntries(dir);
  for (const entry of entries) {
    if (opts.results.length >= opts.maxFiles) break;
    processEntry(dir, entry, opts);
  }
}

function readDirEntries(dir: string): import("node:fs").Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function processEntry(dir: string, entry: import("node:fs").Dirent, opts: ScanDirOptions): void {
  if (entry.isDirectory()) {
    if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
      scanDir(path.join(dir, entry.name), { ...opts, depth: opts.depth + 1 });
    }
    return;
  }

  if (!entry.isFile()) return;

  const fileExt = getTestExt(entry.name, opts.testExts);
  if (!fileExt) return;

  const fileStem = entry.name.slice(0, -fileExt.length);
  if (fileStem.includes(opts.targetBase) || opts.targetBase.includes(fileStem)) {
    opts.results.push(path.join(dir, entry.name));
  }
}

function getTestExt(filename: string, testExts: string[]): string | null {
  for (const ext of testExts) {
    if (filename.endsWith(ext)) return ext;
  }
  return null;
}

/** Check if an outline name looks like a test declaration. */
export function isTestLikeName(name: string): boolean {
  return /^(test|it|describe|spec)\b/i.test(name) || /^(test|it|describe|spec)$/i.test(name);
}

/** Check if a relative file path looks like a test file location. */
export function isTestFilePath(relPath: string): boolean {
  return /\.test\.|\.spec\.|\/__tests__\//.test(relPath);
}

/**
 * Extract test function names from a test file using the structural provider's outline.
 */
export async function extractTestFunctions(
  testFile: string,
  cwd: string,
  provider: { outline: StructuralProvider["outline"] },
  limit: number,
): Promise<{ names: string[]; hasStructuralEvidence: boolean }> {
  const names: string[] = [];
  let hasStructuralEvidence = false;

  try {
    const relPath = path.relative(cwd, testFile);
    const outlineResult = await provider.outline(relPath);
    if (outlineResult.kind === "success") {
      const isTestFile = isTestFilePath(relPath);
      const testFns = outlineResult.data
        .filter((item) => isTestFile || isTestLikeName(item.name))
        .slice(0, limit);
      for (const fn of testFns) {
        names.push(fn.name);
      }
      if (testFns.length > 0) {
        hasStructuralEvidence = true;
      }
    }
  } catch {
    // Continue without test function details
  }

  return { names, hasStructuralEvidence };
}
