/**
 * Shared test-file discovery helpers.
 *
 * Used by `code_graph`, `code_context`, and `code_impact` to find companion
 * test files and extract recognizable test labels.
 *
 * The discovery uses two strategies:
 * 1. **Semantic reference/import evidence** — files that import the source and match test patterns.
 * 2. **Deterministic path conventions** — package-layout mirrors, same-directory companions.
 *
 * Discovery provenance describes only how test files were found. Test-label
 * extraction is tracked separately so callers do not overload provenance with
 * outline/provider availability claims.
 */

import { existsSync, readFileSync } from "node:fs";
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
  /** Structural provider outline method. When present, test labels are extracted. */
  outline?: StructuralProvider["outline"];
  /** Current working directory used for package-root detection and relative display. */
  cwd?: string;
  /** Maximum number of test files to return (default: 8). */
  cap?: number;
  /** LSP position to look up references at (default: file start). */
  position?: CodePosition;
}

/** Label extraction status for one discovered companion test file. */
export type TestLabelExtractionStatus = "recognized" | "none-recognized" | "unavailable";

export interface DiscoveredTestFile {
  /** Absolute path to the discovered test file. */
  absPath: string;
  /** How this file was discovered. */
  provenance: "semantic reference" | "companion file" | "package layout";
  /** Recognized test labels extracted from outline when available. */
  testNames: string[];
  /** Extraction status separate from file-discovery provenance. */
  labelStatus: TestLabelExtractionStatus;
}

/** Evidence source for test discovery. */
export type TestDiscoveryProvenance = "semantic+conventions" | "conventions-only";

export type TestDiscoveryKind = "found" | "empty" | "unavailable";

export type TestDiscoveryReason = "no-semantic-or-structural-provider" | "no-companion-test-files";

/** Result of a test discovery call, with files and overall provenance. */
export interface DiscoverTestFilesResult {
  /** Normalized outcome for callers: found, empty, or unavailable. */
  kind: TestDiscoveryKind;
  /** Optional normalized reason for empty or unavailable outcomes. */
  reason?: TestDiscoveryReason;
  /** Discovered test files, deduplicated, sorted, and capped. */
  files: DiscoveredTestFile[];
  /**
   * Discovery provenance.
   * - `semantic+conventions`: semantic reference evidence contributed.
   * - `conventions-only`: only deterministic path/layout conventions contributed.
   */
  provenance: TestDiscoveryProvenance;
  /** Whether a semantic references provider was available (non-null). */
  semanticsAvailable: boolean;
  /** Whether a structural outline provider was available (non-null). */
  structuralAvailable: boolean;
}

interface ExtractedTestLabels {
  names: string[];
  status: TestLabelExtractionStatus;
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
  sourceAbs = path.resolve(sourceAbs);

  const cap = options.cap ?? 8;
  const seen = new Set<string>();
  const results: DiscoveredTestFile[] = [];
  const semanticsAvailable = options.references != null;
  const structuralAvailable = options.outline != null;

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
        if (seen.has(absPath)) continue;
        seen.add(absPath);
        const extracted = await extractTestLabels(
          absPath,
          options.outline,
          options.cwd ?? path.dirname(sourceAbs),
        );
        results.push({
          absPath,
          provenance: "semantic reference",
          testNames: extracted.names,
          labelStatus: extracted.status,
        });
      }
    }
  }

  const conventionFiles = findConventionTestFiles(sourceAbs, options.cwd);
  for (const absPath of conventionFiles) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    const extracted = await extractTestLabels(
      absPath,
      options.outline,
      options.cwd ?? path.dirname(sourceAbs),
    );
    results.push({
      absPath,
      provenance: "companion file",
      testNames: extracted.names,
      labelStatus: extracted.status,
    });
  }

  results.sort((a, b) => a.absPath.localeCompare(b.absPath));
  const files = results.slice(0, cap);
  const provenance: TestDiscoveryProvenance = semanticContributed
    ? "semantic+conventions"
    : "conventions-only";

  if (files.length === 0) {
    if (!semanticsAvailable && !structuralAvailable) {
      return {
        kind: "unavailable",
        reason: "no-semantic-or-structural-provider",
        files,
        provenance,
        semanticsAvailable,
        structuralAvailable,
      };
    }

    return {
      kind: "empty",
      reason: "no-companion-test-files",
      files,
      provenance,
      semanticsAvailable,
      structuralAvailable,
    };
  }

  return {
    kind: "found",
    files,
    provenance,
    semanticsAvailable,
    structuralAvailable,
  };
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
 * Does NOT match files whose bare stem contains `test` or `spec` without boundary boundaries
 * (e.g. `contest.ts`, `testing.ts`, `tool-specs.ts` are excluded).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deterministic path enumeration across many candidate patterns is simpler as one function
function findConventionTestFiles(sourceAbs: string, cwd?: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const dir = path.dirname(sourceAbs);
  const ext = path.extname(sourceAbs);
  const basename = path.basename(sourceAbs, ext);

  // Guard: skip false-positive source stems that look like tests but aren't.
  if (/^contest$/i.test(basename) || /^testing$/i.test(basename) || /tool-specs$/i.test(basename)) {
    // Source itself is not a test; still permit companion discovery.
  }

  for (const suffix of [".test", ".spec"]) {
    const candidate = path.join(dir, `${basename}${suffix}${ext}`);
    if (!seen.has(candidate) && existsSync(candidate)) {
      seen.add(candidate);
      results.push(candidate);
    }
  }

  for (const suffix of [".test", ".spec"]) {
    const candidate = path.join(dir, "__tests__", `${basename}${suffix}${ext}`);
    if (!seen.has(candidate) && existsSync(candidate)) {
      seen.add(candidate);
      results.push(candidate);
    }
  }

  if (cwd) {
    const pkgRoot = findNearestPackageRoot(dir, cwd);
    if (pkgRoot) {
      const relFromPkg = path.relative(pkgRoot, sourceAbs);
      for (const testPrefix of ["__tests__/unit", "__tests__/integration"]) {
        let mirroredRel = relFromPkg;
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
  if (existsSync(path.join(cwd, "package.json"))) {
    let current = startDir;
    while (current.startsWith(cwd)) {
      if (existsSync(path.join(current, "package.json"))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

async function extractTestLabels(
  testFile: string,
  outline: StructuralProvider["outline"] | undefined,
  cwd: string,
): Promise<ExtractedTestLabels> {
  if (!outline) {
    return extractFallbackTestLabels(testFile);
  }

  try {
    const relPath = path.relative(cwd, testFile);
    const outlineResult = await outline(relPath);
    if (outlineResult.kind === "success") {
      const entries = outlineResult.data.map((item) => item.name);
      const testLike = entries.filter((name) => isTestLikeName(name)).slice(0, 8);
      if (testLike.length > 0) {
        return {
          names: testLike,
          status: "recognized",
        };
      }

      return extractFallbackTestLabels(testFile, "none-recognized");
    }
  } catch {
    // Continue with the conservative fallback parser.
  }

  return extractFallbackTestLabels(testFile);
}

function extractFallbackTestLabels(
  testFile: string,
  emptyStatus: TestLabelExtractionStatus = "unavailable",
): ExtractedTestLabels {
  try {
    const source = readFileSync(testFile, "utf-8");
    const matches = collectObviousTestCallLabels(source);
    if (matches.length > 0) {
      return {
        names: matches,
        status: "recognized",
      };
    }
  } catch {
    // Fall through to the explicit empty/unavailable result.
  }

  return { names: [], status: emptyStatus };
}

function collectObviousTestCallLabels(source: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const regex =
    /(^|[^\w$.])((?:describe|it|test|spec)(?:\.(?:only|skip|todo|concurrent|each))?)\(\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/gs;

  for (const match of source.matchAll(regex)) {
    const callee = match[2];
    const quote = match[3];
    const label = match[4];
    if (!callee || !quote || !label) continue;
    const rendered = `${callee}(${quote}${label}${quote})`;
    if (seen.has(rendered)) continue;
    seen.add(rendered);
    labels.push(rendered);
    if (labels.length >= 8) break;
  }

  return labels;
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
