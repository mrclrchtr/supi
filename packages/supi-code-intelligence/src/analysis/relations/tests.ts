// biome-ignore-all lint/style/noExcessiveLinesPerFile: shared test discovery and presentation helpers stay together to preserve one contract
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

/** Compact per-file metadata shared in tool details. */
export interface TestSurfaceFile {
  /** Workspace-relative test file path when cwd is known, else absolute path. */
  file: string;
  /** Ranked extracted labels shown to users/consumers. */
  labels: string[];
  /** Whether labels were recognized, absent, or unavailable. */
  labelStatus: TestLabelExtractionStatus;
}

/** Small shared tests metadata shape for tool details. */
export interface TestSurfaceDetails {
  /** Whether companion tests were found, empty, or unavailable. */
  status: TestDiscoveryKind;
  /** Discovery provenance only; omitted when unavailable. */
  provenance?: TestDiscoveryProvenance;
  /** Per-file extracted labels and status. */
  files: TestSurfaceFile[];
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

/** Read label data for one known test file without assigning discovery provenance. */
export async function describeTestFile(
  testFile: string,
  options: { outline?: StructuralProvider["outline"]; cwd: string },
): Promise<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">> {
  const extracted = await extractTestLabels(testFile, options.outline, options.cwd);
  return {
    absPath: testFile,
    testNames: extracted.names,
    labelStatus: extracted.status,
  };
}

/** Build a small shared tests metadata shape for structured tool details. */
export function buildTestSurfaceDetails(
  input: {
    status: TestDiscoveryKind;
    provenance?: TestDiscoveryProvenance;
    files: Array<Pick<DiscoveredTestFile, "absPath" | "testNames" | "labelStatus">>;
  },
  cwd: string,
  labelLimit = 8,
): TestSurfaceDetails {
  return {
    status: input.status,
    provenance: input.status === "unavailable" ? undefined : input.provenance,
    files: input.files.map((file) => ({
      file: path.relative(cwd, file.absPath) || file.absPath,
      labels: rankTestLabels(file.testNames, labelLimit),
      labelStatus: file.labelStatus,
    })),
  };
}

/** Render ranked labels for markdown output, or an honest placeholder when none were recognized. */
export function renderRankedTestLabelsForMarkdown(names: string[], limit: number): string[] {
  const ranked = rankTestLabels(names, limit);
  if (ranked.length === 0) return ["  _(no recognized test blocks)_"];
  return ranked.map((name) => `  - \`${name}\``);
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
        const described = await describeTestFile(absPath, {
          outline: options.outline,
          cwd: options.cwd ?? path.dirname(sourceAbs),
        });
        results.push({
          ...described,
          provenance: "semantic reference",
        });
      }
    }
  }

  const conventionFiles = findConventionTestFiles(sourceAbs, options.cwd);
  for (const absPath of conventionFiles) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    const described = await describeTestFile(absPath, {
      outline: options.outline,
      cwd: options.cwd ?? path.dirname(sourceAbs),
    });
    results.push({
      ...described,
      provenance: "companion file",
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
 * 2. Same-directory test dirs: `./__tests__/`, `./tests/`, `./spec/`, `./__spec__/`
 *    each with `basename.test.ext` and `basename.spec.ext`
 * 3. Package-level mirrors: `<pkg>/<test-layout>/<unit|integration>/<src-relative>`
 *    using both `.test.ext` and `.spec.ext` variants.
 *
 * Does NOT match files whose bare stem contains `test` or `spec` without boundary boundaries
 * (e.g. `contest.ts`, `testing.ts`, `tool-specs.ts` are excluded).
 */
const TEST_LAYOUT_PREFIXES = [
  "__tests__/unit",
  "__tests__/integration",
  "tests/unit",
  "tests/integration",
  "spec/unit",
  "spec/integration",
  "__spec__/unit",
  "__spec__/integration",
] as const;
const TEST_FILE_SUFFIXES = [".test", ".spec"] as const;

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

  for (const suffix of TEST_FILE_SUFFIXES) {
    addExistingTestCandidate(results, seen, path.join(dir, `${basename}${suffix}${ext}`));
  }

  for (const suffix of TEST_FILE_SUFFIXES) {
    const companion = `${basename}${suffix}${ext}`;
    addExistingTestCandidate(results, seen, path.join(dir, "__tests__", companion));
    addExistingTestCandidate(results, seen, path.join(dir, "tests", companion));
    addExistingTestCandidate(results, seen, path.join(dir, "spec", companion));
    addExistingTestCandidate(results, seen, path.join(dir, "__spec__", companion));
  }

  if (cwd) {
    const pkgRoot = findNearestPackageRoot(dir, cwd);
    if (pkgRoot) {
      addPackageMirrorCandidates(results, seen, { pkgRoot, sourceAbs, ext });
      addBoundedToolCandidates(results, seen, { pkgRoot, dir, basename, ext });
    }
  }

  return results;
}

function addExistingTestCandidate(results: string[], seen: Set<string>, candidate: string): void {
  if (seen.has(candidate) || !existsSync(candidate)) return;
  seen.add(candidate);
  results.push(candidate);
}

function addPackageMirrorCandidates(
  results: string[],
  seen: Set<string>,
  options: { pkgRoot: string; sourceAbs: string; ext: string },
): void {
  const { pkgRoot, sourceAbs, ext } = options;
  const relFromPkg = path.relative(pkgRoot, sourceAbs);

  for (const testPrefix of TEST_LAYOUT_PREFIXES) {
    let mirroredRel = relFromPkg;
    for (const srcPrefix of ["src/", "lib/", "source/"]) {
      if (mirroredRel.startsWith(srcPrefix)) {
        mirroredRel = mirroredRel.slice(srcPrefix.length);
        break;
      }
    }

    for (const suffix of TEST_FILE_SUFFIXES) {
      const mirroredName = `${path.basename(mirroredRel, ext)}${suffix}${ext}`;
      const mirroredDir = path.dirname(mirroredRel);
      addExistingTestCandidate(
        results,
        seen,
        path.join(pkgRoot, testPrefix, mirroredDir, mirroredName),
      );
    }
  }
}

function addBoundedToolCandidates(
  results: string[],
  seen: Set<string>,
  options: { pkgRoot: string; dir: string; basename: string; ext: string },
): void {
  const { pkgRoot, dir, basename, ext } = options;
  const toolSrcMatch = basename.match(/^execute-(.+)$/);
  const relDirFromPkg = path.relative(pkgRoot, dir).replaceAll("\\", "/");
  if (!toolSrcMatch || relDirFromPkg !== "src/tool") return;

  const toolName = toolSrcMatch[1];
  if (toolName.length === 0) return;

  const boundedStems = [`code-${toolName}-tool`, `${toolName}-tool`, `execute-${toolName}`];
  for (const testPrefix of TEST_LAYOUT_PREFIXES) {
    for (const stem of boundedStems) {
      for (const suffix of TEST_FILE_SUFFIXES) {
        addExistingTestCandidate(
          results,
          seen,
          path.join(pkgRoot, testPrefix, `${stem}${suffix}${ext}`),
        );
      }
    }
  }
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
  for (;;) {
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

function rankTestLabels(names: string[], limit: number): string[] {
  const unique = [...new Set(names)];
  if (unique.length === 0) return [];

  const runnable = unique.filter((name) => isRunnableTestLabel(name));
  const describe = unique.filter((name) => isDescribeTestLabel(name));
  const other = unique.filter((name) => !isRunnableTestLabel(name) && !isDescribeTestLabel(name));

  if (runnable.length === 0) {
    return [...describe, ...other].slice(0, limit);
  }

  const describeCap = Math.min(2, describe.length);
  const runnableCap = Math.min(runnable.length, Math.max(1, limit - describeCap));
  const remainingAfterRunnable = Math.max(0, limit - runnableCap);
  const describeShown = describe.slice(0, Math.min(describeCap, remainingAfterRunnable));
  const remainingAfterDescribe = Math.max(0, limit - runnableCap - describeShown.length);
  const otherShown = other.slice(0, remainingAfterDescribe);

  return [...runnable.slice(0, runnableCap), ...describeShown, ...otherShown];
}

function isRunnableTestLabel(name: string): boolean {
  return /^(it|test|spec)\b/i.test(name);
}

function isDescribeTestLabel(name: string): boolean {
  return /^describe\b/i.test(name);
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
