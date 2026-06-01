/**
 * Shared test-file discovery helpers.
 *
 * Used by both `code_context` and `code_graph` to find companion test files
 * and extract test function names via tree-sitter outline.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import type { StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";

/**
 * Find companion test files for a given source file (absolute path).
 * Returns absolute paths to existing test files.
 */
export function findTestCompanionFiles(targetAbs: string): string[] {
  const ext = path.extname(targetAbs);
  const stem = targetAbs.slice(0, ext.length > 0 ? -ext.length : undefined);
  const dir = path.dirname(targetAbs);
  const base = path.basename(stem);
  const candidates = [
    `${stem}.test${ext}`,
    `${stem}.spec${ext}`,
    path.join(dir, "__tests__", `${base}.test${ext}`),
    path.join(dir, "__tests__", `${base}.spec${ext}`),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
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
