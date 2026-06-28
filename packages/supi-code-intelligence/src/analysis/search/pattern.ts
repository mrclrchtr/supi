import { execFileSync } from "node:child_process";
import * as path from "node:path";
import type { StructuralProvider as StructuralSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import { getSupportedExtensions } from "@mrclrchtr/supi-tree-sitter/api";

/** Soft file cap — warn when a workspace has more source files than this. */
const FILE_SOFT_CAP = 5000;
const STRUCTURED_PATTERN_TIMEOUT_MS = 10_000;

export type StructuredPatternKind =
  | "definition"
  | "export"
  | "import"
  | "call"
  | "type"
  | "interface"
  | "class"
  | "method"
  | "enum"
  | "test";

export interface StructuredPatternParams {
  pattern: string;
  kind: StructuredPatternKind;
  regex?: boolean;
}

export interface StructuredMatch {
  file: string;
  name: string;
  kind: string;
  line: number;
}

export interface StructuredPatternResult {
  matches: StructuredMatch[];
  omittedCount: number;
  partialReason: "file-cap" | "timeout" | null;
  /** Per-file parse/analysis failures surfaced to the agent. */
  failures: StructuredFailure[];
}

export interface StructuredFailure {
  file: string;
  reason: string;
}

export function isStructuredPatternKind(kind: string | undefined): kind is StructuredPatternKind {
  return (
    kind === "definition" ||
    kind === "export" ||
    kind === "import" ||
    kind === "call" ||
    kind === "type" ||
    kind === "interface" ||
    kind === "class" ||
    kind === "method" ||
    kind === "enum" ||
    kind === "test"
  );
}

// biome-ignore lint/complexity/useMaxParams: substrate injection keeps related inputs explicit for readability
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: enumeration-interrupted, cap, timeout, and error branches are each necessary
export async function getStructuredPatternMatches(
  params: StructuredPatternParams,
  scopePath: string,
  cwd: string,
  relScope: string,
  structural: StructuralSubstrate,
): Promise<StructuredPatternResult | string | null> {
  const deadline = Date.now() + STRUCTURED_PATTERN_TIMEOUT_MS;

  // Enumerate all supported source files via ripgrep (language-agnostic).
  const enumeration = enumerateSourceFiles(scopePath, cwd);
  if (enumeration === null) {
    return `Ripgrep (rg) is not available. Install it for structured pattern search.`;
  }

  const allFiles = enumeration.files;
  let omittedCount = 0;

  if (enumeration.interrupted) {
    // rg was killed before completing the file listing — treat as partial
    omittedCount = Math.max(1, omittedCount);
  }

  if (allFiles.length === 0) {
    return {
      matches: [],
      omittedCount,
      partialReason: enumeration.interrupted ? "timeout" : null,
      failures: [],
    };
  }

  const capped = allFiles.slice(0, FILE_SOFT_CAP);
  if (allFiles.length > FILE_SOFT_CAP) {
    omittedCount = allFiles.length - FILE_SOFT_CAP;
  }

  const matcher = createStructuredMatcher(params.pattern, params.regex ?? false);
  if (typeof matcher === "string") {
    return matcher;
  }

  try {
    const matches: StructuredMatch[] = [];
    const failures: StructuredFailure[] = [];
    let timedOut = false;

    for (const [index, file] of capped.entries()) {
      if (Date.now() > deadline) {
        omittedCount += capped.length - index;
        timedOut = true;
        break;
      }
      const absFile = path.resolve(cwd, file);
      const relFile = path.relative(cwd, absFile);
      await collectMatchesForFile(matches, failures, structural, relFile, params.kind, matcher);
    }

    return {
      matches,
      failures,
      omittedCount: timedOut ? Math.max(1, omittedCount) : omittedCount,
      partialReason: timedOut ? "timeout" : omittedCount > 0 ? "file-cap" : null,
    };
  } catch {
    return `No structured ${params.kind} search data available in \`${relScope}\`. Try omitting \`kind\` for plain text search.`;
  }
}

// ── File enumeration ─────────────────────────────────────────────────

interface FileEnumeration {
  files: string[];
  /** True when rg was terminated before completing the listing. */
  interrupted: boolean;
}

/**
 * Enumerate all tree-sitter-supported source files in scopePath using rg --files.
 * Returns null if ripgrep is not available.
 */
function enumerateSourceFiles(scopePath: string, cwd: string): FileEnumeration | null {
  const extensions = getSupportedExtensions();
  // Strip leading dots — ripgrep -g expects ".ext" without the dot prefix
  const globPattern = `*.{${Array.from(extensions)
    .map((ext) => ext.replace(/^\./, ""))
    .join(",")}}`;

  try {
    const output = execFileSync("rg", ["--files", "-g", globPattern, scopePath], {
      encoding: "utf-8",
      cwd,
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      files: output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .sort((a, b) => a.localeCompare(b)),
      interrupted: false,
    };
  } catch (err: unknown) {
    if (isCodeError(err, "ENOENT")) {
      return null;
    }
    // Non-zero exit (e.g. no matches) is fine — return what we got
    if (isExecError(err)) {
      const stdout = typeof err.stdout === "string" ? err.stdout : "";
      const wasKilled = (err as { killed?: boolean }).killed === true;
      return {
        files: stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .sort((a, b) => a.localeCompare(b)),
        interrupted: wasKilled,
      };
    }
    return { files: [], interrupted: false };
  }
}

// biome-ignore lint/complexity/useMaxParams: helper takes explicit collection inputs to avoid intermediate objects in the hot path
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: kind-specific tree-sitter matching is clearest as one helper
async function collectMatchesForFile(
  matches: StructuredMatch[],
  failures: StructuredFailure[],
  structural: StructuralSubstrate,
  relFile: string,
  kind: StructuredPatternKind,
  matcher: (value: string) => boolean,
): Promise<void> {
  const recordFailure = (reason: string) => {
    failures.push({ file: relFile, reason });
  };

  if (kind === "definition") {
    const outline = await structural.outline(relFile);
    if (!handleStructuralResult(outline, relFile, recordFailure)) return;
    for (const item of outline.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "export") {
    const exportsResult = await structural.exports(relFile);
    if (!handleStructuralResult(exportsResult, relFile, recordFailure)) return;
    for (const item of exportsResult.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "import") {
    const importsResult = await structural.imports(relFile);
    if (!handleStructuralResult(importsResult, relFile, recordFailure)) return;
    for (const item of importsResult.data) {
      if (!matcher(item.moduleSpecifier)) continue;
      matches.push({
        file: relFile,
        name: item.moduleSpecifier,
        kind: "import",
        line: item.startLine,
      });
    }
    return;
  }

  if (kind === "call") {
    const callResult = await structural.callSites(relFile);
    if (!handleStructuralResult(callResult, relFile, recordFailure)) return;
    for (const cs of callResult.data) {
      if (!matcher(cs.name)) continue;
      matches.push({ file: relFile, name: cs.name, kind: "call", line: cs.startLine });
    }
    return;
  }

  // ── type / interface / class / method / enum / test — use outline with kind-specific filters ─

  if (
    kind === "type" ||
    kind === "interface" ||
    kind === "class" ||
    kind === "method" ||
    kind === "enum" ||
    kind === "test"
  ) {
    const outline = await structural.outline(relFile);
    if (!handleStructuralResult(outline, relFile, recordFailure)) return;
    for (const item of outline.data) {
      if (kind === "type" && !isTypeLikeKind(item.kind)) continue;
      if (kind === "interface" && !isInterfaceKind(item.kind)) continue;
      if (kind === "class" && item.kind.toLowerCase() !== "class") continue;
      if (kind === "method" && item.kind.toLowerCase() !== "method") continue;
      if (kind === "enum" && item.kind.toLowerCase() !== "enum") continue;
      if (kind === "test") {
        const isTestName =
          /^(test|it|describe|spec)\b/.test(item.name) ||
          /\b(test|spec|Test|Spec)\b/.test(item.name);
        if (!isTestName && !matcher(item.name)) continue;
      }
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
  }
}

// ── Result handling ──────────────────────────────────────────────────

/**
 * Handle a structural CodeResult: surface non-success results as failures,
 * return whether the caller should continue processing data.
 */
function handleStructuralResult<T>(
  result: { kind: string; message?: string; file?: string },
  _relFile: string,
  recordFailure: (reason: string) => void,
): result is { kind: "success"; data: T } {
  if (result.kind === "success") return true;
  recordFailure(result.message ?? result.kind);
  return false;
}

/** Outline kind values that represent type declarations (as normalized by the outline extractor). */
const TYPE_LIKE_KINDS = new Set(["class", "interface", "type", "enum"]);

function isTypeLikeKind(kind: string): boolean {
  return TYPE_LIKE_KINDS.has(kind.toLowerCase());
}

function isInterfaceKind(kind: string): boolean {
  return kind.toLowerCase() === "interface";
}

function createStructuredMatcher(
  pattern: string,
  regex: boolean,
): ((value: string) => boolean) | string {
  const ignoreCase = !/[A-Z]/.test(pattern);

  if (regex) {
    try {
      const compiled = new RegExp(pattern, ignoreCase ? "i" : undefined);
      return (value: string) => compiled.test(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid regex";
      return `**Error:** Invalid regex pattern \`${pattern}\`: ${message}`;
    }
  }

  const needle = ignoreCase ? pattern.toLowerCase() : pattern;
  return (value: string) => {
    const haystack = ignoreCase ? value.toLowerCase() : value;
    return haystack.includes(needle);
  };
}

// ── Error helpers ────────────────────────────────────────────────────

function isExecError(err: unknown): err is {
  status: number;
  stdout?: unknown;
  stderr?: unknown;
} {
  return typeof err === "object" && err !== null && "status" in err;
}

function isCodeError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}
