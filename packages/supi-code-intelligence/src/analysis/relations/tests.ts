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

/** Evidence source for test discovery. */
export type TestDiscoveryProvenance = "semantic+conventions" | "conventions-only";

/** Result of a test discovery call, with files and overall provenance. */
export interface DiscoverTestFilesResult {
  /** Discovered test files, deduplicated, sorted, and capped. */
  files: DiscoveredTestFile[];
  /**
   * Evidence provenance for the discovery.
   * - `"semantic+conventions"`: semantic reference evidence contributed.
   * - `"conventions-only"`: no semantic provider available or returned zero results.
   */
  provenance: TestDiscoveryProvenance;
  /** Whether a semantic references provider was available (non-null). Distinguishes "provider absent" from "provider present but found nothing". */
  semanticsAvailable: boolean;
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
): Promise<DiscoverTestFilesResult> {
  // Resolve to absolute so convention-path comparisons match LSP absolute paths.
  sourceAbs = path.resolve(sourceAbs);

  const cap = options.cap ?? 8;
  const seen = new Set<string>();
  const results: DiscoveredTestFile[] = [];
  const semanticsAvailable = options.references != null;

  // ── Strategy 1: Semantic references ───────────────────────────────
  let semanticContributed = false;
  if (options.references) {
    const refs = await options.references(sourceAbs, options.position ?? { line: 0, character: 0 });
    if (refs && refs.length > 0) {
      const refFiles = [
        ...new Set(
          refs
            .filter((ref) => isTestFilePath(ref.uri))
            .map((ref) => (ref.uri.startsWith("file://") ? fileURLToPath(ref.uri) : ref.uri)),
        ),
      ];

      if (refFiles.length > 0) {
        semanticContributed = true;
      }

      for (const absPath of refFiles) {
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
  const files = results.slice(0, cap);
  const provenance: TestDiscoveryProvenance = semanticContributed
    ? "semantic+conventions"
    : "conventions-only";
  return { files, provenance, semanticsAvailable };
}

// ── Internal helpers ─────────────────────────────────────────────────

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
      const entries = outlineResult.data.map((item) => item.name);
      // Prefer test-like names (describe, it, test, spec).
      const testLike = entries.filter((n) => isTestLikeName(n));
      if (testLike.length > 0) return testLike.slice(0, 8);
      // Fall back to all entries for test files when tree-sitter can't
      // extract describe/it/test call expressions (common with Vitest/Jest).
      // Non-test-like names are annotated by callers.
      if (isTestFilePath(relPath)) return entries.slice(0, 8);
      return [];
    }
  } catch {
    // Continue without test function details
  }
  return [];
}

// ── Existing language-agnostic detection helpers ─────────────────────

/** Test-support directories that should not be treated as runnable tests. */
const TEST_SUPPORT_SEGMENTS = ["/__tests__/helpers/", "/__tests__/fixtures/"];

/** Check if a file path points at test support code rather than a runnable test. */
export function isTestSupportPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return TEST_SUPPORT_SEGMENTS.some((segment) => normalized.includes(segment));
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
