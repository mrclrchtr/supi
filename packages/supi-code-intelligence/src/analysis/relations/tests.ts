/**
 * Shared test-file discovery helpers.
 *
 * Used by both `code_context` and `code_graph` to find companion test files
 * and extract test function names via tree-sitter outline.
 *
 * The discovery uses two strategies:
 * 1. **Semantic reference/import evidence** — files that import the source and match test patterns.
 * 2. **Deterministic path conventions** — package-layout mirrors, same-directory companions.
 * Both strategies are combined, deduplicated, sorted, and capped.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CodePosition,
  SemanticProvider,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

// ── Public interface ─────────────────────────────────────────────────

export interface DiscoverTestFilesOptions {
  /** Semantic provider references method. When absent, no reference-based discovery. */
  references?: SemanticProvider["references"];
  /** Structural provider outline method. When present, test function names are extracted. */
  outline?: StructuralProvider["outline"];
  /** Current working directory used for package-root detection and relative display. */
  cwd?: string;
  /** Maximum number of test files to return (default: 8). */
  cap?: number;
  /** LSP position to look up references at (default: file start). */
  position?: CodePosition;
}

export interface DiscoveredTestFile {
  /** Absolute path to the discovered test file. */
  absPath: string;
  /** How this file was discovered. */
  provenance: "semantic reference" | "companion file" | "package layout";
  /** Test function names extracted from outline (only when provider.outline is supplied). */
  testNames: string[];
}

/**
 * Discover companion test files for a source file using both semantic evidence
 * and deterministic path conventions.
 *
 * Returns discovered test files with metadata, deduplicated, sorted, and capped.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reference-based + convention-based discovery orchestration stays together
export async function discoverTestFilesForSource(
  sourceAbs: string,
  options: DiscoverTestFilesOptions,
): Promise<DiscoveredTestFile[]> {
  const cap = options.cap ?? 8;
  const seen = new Set<string>();
  const results: DiscoveredTestFile[] = [];

  // ── Strategy 1: Semantic references ───────────────────────────────
  if (options.references) {
    const refFiles = await findReferenceTestFiles(sourceAbs, options.references, options.position);
    for (const absPath of refFiles) {
      if (seen.has(absPath)) continue;
      seen.add(absPath);
      const testNames = options.outline
        ? await extractTestFunctionNames(
            absPath,
            options.outline,
            options.cwd ?? path.dirname(sourceAbs),
          )
        : [];
      results.push({ absPath, provenance: "semantic reference", testNames });
    }
  }

  // ── Strategy 2: Deterministic path conventions ────────────────────
  const conventionFiles = findConventionTestFiles(sourceAbs, options.cwd);
  for (const absPath of conventionFiles) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    const testNames = options.outline
      ? await extractTestFunctionNames(
          absPath,
          options.outline,
          options.cwd ?? path.dirname(sourceAbs),
        )
      : [];
    results.push({ absPath, provenance: "companion file", testNames });
  }

  // Deduplicate by absolute path (already done above), sort, cap
  results.sort((a, b) => a.absPath.localeCompare(b.absPath));
  return results.slice(0, cap);
}

/**
 * Find companion test files for a given source file (absolute path)
 * using import-graph analysis (semantic references only).
 *
 * @deprecated Use `discoverTestFilesForSource` which also applies deterministic fallbacks.
 */
export async function findTestCompanionFiles(
  targetAbs: string,
  { references }: { references: SemanticProvider["references"] },
  position: CodePosition = { line: 0, character: 0 },
): Promise<string[]> {
  const refs = await references(targetAbs, position);
  if (!refs) return [];

  const seen = new Set<string>();
  return refs
    .filter((ref) => isTestFile(ref.uri))
    .map((ref) => (ref.uri.startsWith("file://") ? fileURLToPath(ref.uri) : ref.uri))
    .filter((abs) => {
      if (seen.has(abs)) return false;
      seen.add(abs);
      return true;
    });
}

// ── Internal helpers ─────────────────────────────────────────────────

async function findReferenceTestFiles(
  targetAbs: string,
  references: SemanticProvider["references"],
  position: CodePosition = { line: 0, character: 0 },
): Promise<string[]> {
  return findTestCompanionFiles(targetAbs, { references }, position);
}

/**
 * Apply deterministic path conventions to discover test files for a source.
 *
 * Checks:
 * 1. Same-directory: `./basename.test.ext`, `./basename.spec.ext`
 * 2. Same-directory `__tests__/`: `./__tests__/basename.test.ext`, `./__tests__/basename.spec.ext`
 * 3. Package-level mirrors: `<pkg>/__tests__/unit/<src-relative>`, `<pkg>/__tests__/integration/<src-relative>`
 *    using both `.test.ext` and `.spec.ext` variants.
 *
 * Does NOT match files whose bare stem contains "test" or "spec" without boundary boundaries
 * (e.g. contest.ts, testing.ts, tool-specs.ts are excluded).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deterministic path enumeration across many candidate patterns is simpler as one function
function findConventionTestFiles(sourceAbs: string, cwd?: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const dir = path.dirname(sourceAbs);
  const ext = path.extname(sourceAbs);
  const basename = path.basename(sourceAbs, ext);
  const _stem = path.basename(sourceAbs);

  // Guard: skip false-positive source stems that look like tests but aren't
  if (/^contest$/i.test(basename) || /^testing$/i.test(basename) || /tool-specs$/i.test(basename)) {
    // Source itself is not a test; still permit companion discovery.
  }

  // 1. Same-directory companions: foo.test.ext, foo.spec.ext
  for (const suffix of [".test", ".spec"]) {
    const candidate = path.join(dir, `${basename}${suffix}${ext}`);
    if (!seen.has(candidate) && existsSync(candidate)) {
      seen.add(candidate);
      results.push(candidate);
    }
  }

  // 2. Same-directory __tests__/: foo/__tests__/basename.test.ext, foo/__tests__/basename.spec.ext
  for (const suffix of [".test", ".spec"]) {
    const candidate = path.join(dir, "__tests__", `${basename}${suffix}${ext}`);
    if (!seen.has(candidate) && existsSync(candidate)) {
      seen.add(candidate);
      results.push(candidate);
    }
  }

  // 3. Package-level mirrors — requires cwd for package-root detection
  if (cwd) {
    const pkgRoot = findNearestPackageRoot(dir, cwd);
    if (pkgRoot) {
      const relFromPkg = path.relative(pkgRoot, sourceAbs);
      // Try package-level __tests__/unit/ and __tests__/integration/ mirrors
      for (const testPrefix of ["__tests__/unit", "__tests__/integration"]) {
        // Replace src/ or lib/ prefix with test prefix
        let mirroredRel = relFromPkg;
        // Strip common source prefixes
        for (const srcPrefix of ["src/", "lib/", "source/"]) {
          if (mirroredRel.startsWith(srcPrefix)) {
            mirroredRel = mirroredRel.slice(srcPrefix.length);
            break;
          }
        }
        for (const suffix of [".test", ".spec"]) {
          const mirroredName = `${path.basename(mirroredRel, ext)}${suffix}${ext}`;
          const mirroredDir = path.dirname(mirroredRel);
          const candidate = path.join(pkgRoot, testPrefix, mirroredDir, mirroredName);
          if (!seen.has(candidate) && existsSync(candidate)) {
            seen.add(candidate);
            results.push(candidate);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Walk up from `startDir` until we find a directory with a `package.json`,
 * then return that directory path. Returns null if nothing found up to the
 * filesystem root or `cwd` if cwd itself has a package.json.
 */
function findNearestPackageRoot(startDir: string, cwd: string): string | null {
  // First check if cwd is already a package root
  if (existsSync(path.join(cwd, "package.json"))) {
    // Walk up from startDir toward cwd to find the nearest package root
    let current = startDir;
    while (current.startsWith(cwd)) {
      if (existsSync(path.join(current, "package.json"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break; // filesystem root
      current = parent;
    }
  }

  // Fallback: walk up from startDir toward fs root
  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  return null;
}

async function extractTestFunctionNames(
  testFile: string,
  outline: StructuralProvider["outline"],
  cwd: string,
): Promise<string[]> {
  try {
    const relPath = path.relative(cwd, testFile);
    const outlineResult = await outline(relPath);
    if (outlineResult.kind === "success") {
      const isTestF = isTestFilePath(relPath);
      return outlineResult.data
        .filter((item) => isTestF || isTestLikeName(item.name))
        .slice(0, 8)
        .map((item) => item.name);
    }
  } catch {
    // Continue without test function details
  }
  return [];
}

// ── Existing language-agnostic detection helpers ─────────────────────

/** Language-agnostic patterns for identifying test files. */
const TEST_FILE_PATTERNS = [
  /\.test\.[^.]+$/, // foo.test.ts
  /\.spec\.[^.]+$/, // foo.spec.py
  /^test_.+\.[^.]+$/, // test_foo.py
  /_test\.[^.]+$/, // foo_test.go
  /_spec\.[^.]+$/, // foo_spec.rb
];

/** Test-support directories that should not be treated as runnable tests. */
const TEST_SUPPORT_SEGMENTS = ["/__tests__/helpers/", "/__tests__/fixtures/"];

/** Check if a file path points at test support code rather than a runnable test. */
export function isTestSupportPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return TEST_SUPPORT_SEGMENTS.some((segment) => normalized.includes(segment));
}

/**
 * Check if a file path matches known test file naming patterns.
 * Language-agnostic — works for any extension.
 */
export function isTestFile(filePath: string): boolean {
  if (isTestSupportPath(filePath)) {
    return false;
  }

  const filename = path.basename(filePath);
  return TEST_FILE_PATTERNS.some((p) => p.test(filename));
}

/** Check if an outline name looks like a test declaration. */
export function isTestLikeName(name: string): boolean {
  return /^(test|it|describe|spec)\b/i.test(name) || /^(test|it|describe|spec)$/i.test(name);
}

/** Check if a relative file path looks like a test file location. */
export function isTestFilePath(relPath: string): boolean {
  if (isTestSupportPath(relPath)) {
    return false;
  }

  const normalized = relPath.replaceAll("\\", "/");
  return /\.test\.|\.spec\.|\/__tests__\//.test(normalized);
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
      const isTestF = isTestFilePath(relPath);
      const testFns = outlineResult.data
        .filter((item) => isTestF || isTestLikeName(item.name))
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
