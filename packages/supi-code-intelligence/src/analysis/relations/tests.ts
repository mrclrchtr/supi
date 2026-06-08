/**
 * Shared test-file discovery helpers.
 *
 * Used by both `code_context` and `code_graph` to find companion test files
 * and extract test function names via tree-sitter outline.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CodePosition,
  SemanticProvider,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

/**
 * Find companion test files for a given source file (absolute path)
 * using import-graph analysis.
 *
 * Uses the provider's `references` to find all files that import the
 * target source, then filters to those matching test file naming patterns.
 * Returns absolute paths to test files.
 *
 * @param targetAbs - Absolute path to the source file.
 * @param references - The provider's `references` method (destructured for testability).
 * @param position - LSP position to look up references at (default: file start).
 */
export async function findTestCompanionFiles(
  targetAbs: string,
  { references }: { references: SemanticProvider["references"] },
  position: CodePosition = { line: 0, character: 0 },
): Promise<string[]> {
  const refs = await references(targetAbs, position);
  if (!refs) return [];

  return refs
    .filter((ref) => isTestFile(ref.uri))
    .map((ref) => (ref.uri.startsWith("file://") ? fileURLToPath(ref.uri) : ref.uri));
}

/** Language-agnostic patterns for identifying test files. */
const TEST_FILE_PATTERNS = [
  /\.test\.[^.]+$/, // foo.test.ts
  /\.spec\.[^.]+$/, // foo.spec.py
  /^test_.+\.[^.]+$/, // test_foo.py
  /_test\.[^.]+$/, // foo_test.go
  /_spec\.[^.]+$/, // foo_spec.rb
];

/**
 * Check if a file path matches known test file naming patterns.
 * Language-agnostic — works for any extension.
 */
export function isTestFile(filePath: string): boolean {
  const filename = path.basename(filePath);
  return TEST_FILE_PATTERNS.some((p) => p.test(filename));
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
