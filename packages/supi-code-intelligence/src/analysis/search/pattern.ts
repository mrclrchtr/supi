import type {
  OutlineData,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { CodeFindAstKind } from "../../tool/find/ast-kinds.ts";
import type { EvidencePartialReason } from "../evidence.ts";
import {
  type AstScanExclusion,
  type AstScanLimitation,
  type AstScanOperations,
  type AstScanPolicy,
  DEFAULT_AST_SCAN_MAX_FILES,
  DEFAULT_AST_SCAN_TIMEOUT_MS,
  enumerateAstFiles,
} from "./ast-scan.ts";
import { callableExpressionForMatching } from "./call-name.ts";
import { settleByDeadline } from "./deadline.ts";
import { relativeDisplayPath } from "./paths.ts";

export interface StructuredPatternParams {
  readonly pattern: string;
  readonly kind: CodeFindAstKind;
}

export interface StructuredMatch {
  readonly file: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
}

export interface StructuredFailure {
  readonly file: string;
  readonly reason: string;
}

export type StructuredScanLimitation = AstScanLimitation | ProviderScanLimitation;

export interface ProviderScanLimitation {
  readonly reason: "provider-failure";
  readonly pathCount: number;
  readonly examples: readonly string[];
}

/** Structured completeness state for the AST source-file scan. */
export interface StructuredScanSummary {
  readonly universe: "tree-sitter-supported-files";
  readonly roots: readonly string[];
  readonly policy: AstScanPolicy;
  readonly eligibleFileCount: number | null;
  readonly analyzedFileCount: number;
  readonly complete: boolean;
  readonly exclusions: readonly AstScanExclusion[];
  readonly limitations: readonly StructuredScanLimitation[];
}

export interface StructuredPatternResult {
  readonly matches: readonly StructuredMatch[];
  readonly partialReason: EvidencePartialReason | null;
  /** Per-file parse/analysis failures surfaced to the agent. */
  readonly failures: readonly StructuredFailure[];
  readonly scan: StructuredScanSummary;
}

export type StructuredPatternOutcome =
  | { readonly kind: "completed"; readonly result: StructuredPatternResult }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Internal controls for deterministic deadline, filesystem, and cancellation tests. */
export interface StructuredPatternControl {
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly operations?: AstScanOperations;
  readonly maxFiles?: number;
  readonly timeoutMs?: number;
}

export interface StructuredPatternSearchOptions {
  readonly params: StructuredPatternParams;
  readonly roots: string | readonly string[];
  readonly cwd: string;
  readonly structural: StructuralSubstrate;
  readonly control?: StructuredPatternControl;
}

/**
 * Enumerate and analyze the declared AST Scan universe.
 *
 * Abort propagates to the tool boundary. Deadline, safety-cap, traversal, and
 * provider limitations instead produce explicit incomplete scan metadata.
 */
export async function getStructuredPatternMatches(
  options: StructuredPatternSearchOptions,
): Promise<StructuredPatternOutcome> {
  const now = options.control?.now ?? Date.now;
  const maxFiles = options.control?.maxFiles ?? DEFAULT_AST_SCAN_MAX_FILES;
  const timeoutMs = options.control?.timeoutMs ?? DEFAULT_AST_SCAN_TIMEOUT_MS;
  const deadline = now() + timeoutMs;
  const roots = Array.isArray(options.roots) ? [...options.roots] : [options.roots];
  options.control?.signal?.throwIfAborted();

  const enumeration = await enumerateAstFiles({
    cwd: options.cwd,
    roots,
    deadline,
    maxFiles,
    timeoutMs,
    signal: options.control?.signal,
    now,
    operations: options.control?.operations,
  });
  if (enumeration.kind === "invalid-root") {
    return {
      kind: "invalid-input",
      message: `${enumeration.reason} Scope: \`${enumeration.path}\`.`,
    };
  }
  if (
    enumeration.files.length === 0 &&
    enumeration.limitations.some((limitation) => limitation.reason === "unreadable-path")
  ) {
    return {
      kind: "unavailable",
      reason: "No AST source file could be enumerated because the requested scope was unreadable.",
    };
  }

  const analysis = await analyzeStructuredFiles({
    files: enumeration.files,
    displayBase: enumeration.displayBase,
    params: options.params,
    structural: options.structural,
    deadline,
    now,
    signal: options.control?.signal,
    initialLimitations: enumeration.limitations,
  });
  const complete = enumeration.complete && analysis.limitations.length === 0;
  return {
    kind: "completed",
    result: {
      matches: analysis.matches,
      failures: analysis.failures,
      partialReason: complete ? null : primaryPartialReason(analysis.limitations),
      scan: {
        universe: "tree-sitter-supported-files",
        roots: roots.map((root) => relativeDisplayPath(options.cwd, root)),
        policy: enumeration.policy,
        eligibleFileCount: enumeration.eligibleFileCount,
        analyzedFileCount: analysis.analyzedFileCount,
        complete,
        exclusions: enumeration.exclusions,
        limitations: analysis.limitations,
      },
    },
  };
}

interface AnalyzeStructuredFilesOptions {
  readonly files: readonly string[];
  readonly displayBase: string;
  readonly params: StructuredPatternParams;
  readonly structural: StructuralSubstrate;
  readonly deadline: number;
  readonly now: () => number;
  readonly signal?: AbortSignal;
  readonly initialLimitations: readonly AstScanLimitation[];
}

async function analyzeStructuredFiles(options: AnalyzeStructuredFilesOptions): Promise<{
  matches: StructuredMatch[];
  failures: StructuredFailure[];
  limitations: StructuredScanLimitation[];
  analyzedFileCount: number;
}> {
  const matches: StructuredMatch[] = [];
  const failures: StructuredFailure[] = [];
  const limitations: StructuredScanLimitation[] = [...options.initialLimitations];
  const matcher = createStructuredMatcher(options.params.pattern);
  let analyzedFileCount = 0;

  for (const [index, absoluteFile] of options.files.entries()) {
    options.signal?.throwIfAborted();
    if (options.now() > options.deadline) {
      addAnalysisTimeout(limitations, options.files.slice(index), options.displayBase);
      break;
    }
    const relativeFile = relativeDisplayPath(options.displayBase, absoluteFile);
    const fileMatches: StructuredMatch[] = [];
    const fileFailures: StructuredFailure[] = [];
    const outcome = await settleByDeadline(
      async () => {
        try {
          await collectMatchesForFile(
            fileMatches,
            fileFailures,
            options.structural,
            relativeFile,
            options.params.kind,
            matcher,
          );
        } catch (error) {
          fileFailures.push({ file: relativeFile, reason: errorMessage(error) });
        }
      },
      { deadline: options.deadline, now: options.now, signal: options.signal },
    );
    if (outcome.kind === "timeout") {
      addAnalysisTimeout(limitations, options.files.slice(index), options.displayBase);
      break;
    }
    options.signal?.throwIfAborted();
    matches.push(...fileMatches);
    failures.push(...fileFailures);
    if (fileFailures.length === 0) analyzedFileCount += 1;
  }

  if (failures.length > 0) {
    limitations.push({
      reason: "provider-failure",
      pathCount: failures.length,
      examples: failures.slice(0, 5).map((failure) => failure.file),
    });
  }
  return { matches, failures, limitations, analyzedFileCount };
}

function addAnalysisTimeout(
  limitations: StructuredScanLimitation[],
  remainingFiles: readonly string[],
  cwd: string,
): void {
  if (limitations.some((limitation) => limitation.reason === "timeout")) return;
  limitations.push({
    reason: "timeout",
    pathCount: remainingFiles.length,
    examples: remainingFiles.slice(0, 5).map((file) => relativeDisplayPath(cwd, file)),
  });
}

function primaryPartialReason(
  limitations: readonly StructuredScanLimitation[],
): EvidencePartialReason {
  if (limitations.some((limitation) => limitation.reason === "timeout")) return "timeout";
  if (limitations.some((limitation) => limitation.reason === "safety-limit")) {
    return "safety-limit";
  }
  if (limitations.some((limitation) => limitation.reason === "unreadable-path")) {
    return "interrupted";
  }
  return "provider-limited";
}

// biome-ignore lint/complexity/useMaxParams: helper takes explicit collection inputs to avoid intermediate objects in the hot path
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: kind-specific tree-sitter matching is clearest as one helper
async function collectMatchesForFile(
  matches: StructuredMatch[],
  failures: StructuredFailure[],
  structural: StructuralSubstrate,
  relFile: string,
  kind: CodeFindAstKind,
  matcher: (value: string) => boolean,
): Promise<void> {
  const recordFailure = (reason: string) => {
    failures.push({ file: relFile, reason });
  };

  if (kind === "definition") {
    const outline = await structural.outline(relFile);
    if (!handleStructuralResult(outline, recordFailure)) return;
    for (const item of flattenOutlineItems(outline.data)) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "export") {
    const exportsResult = await structural.exports(relFile);
    if (!handleStructuralResult(exportsResult, recordFailure)) return;
    for (const item of exportsResult.data) {
      if (!matcher(item.name)) continue;
      matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
    }
    return;
  }

  if (kind === "import") {
    const importsResult = await structural.imports(relFile);
    if (!handleStructuralResult(importsResult, recordFailure)) return;
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
    if (!handleStructuralResult(callResult, recordFailure)) return;
    for (const call of callResult.data) {
      if (!matcher(callableExpressionForMatching(call.name))) continue;
      matches.push({ file: relFile, name: call.name, kind: "call", line: call.startLine });
    }
    return;
  }

  const outline = await structural.outline(relFile);
  if (!handleStructuralResult(outline, recordFailure)) return;
  for (const item of flattenOutlineItems(outline.data)) {
    if (kind === "type" && !TYPE_LIKE_KINDS.has(item.kind.toLowerCase())) continue;
    if (kind === "interface" && item.kind.toLowerCase() !== "interface") continue;
    if (kind === "class" && item.kind.toLowerCase() !== "class") continue;
    if (kind === "method" && item.kind.toLowerCase() !== "method") continue;
    if (kind === "enum" && item.kind.toLowerCase() !== "enum") continue;
    if (!matcher(item.name)) continue;
    matches.push({ file: relFile, name: item.name, kind: item.kind, line: item.startLine });
  }
}

/** Flatten provider outlines so nested class/interface/enum declarations remain searchable. */
function flattenOutlineItems(items: readonly OutlineData[]): OutlineData[] {
  return items.flatMap((item) => [item, ...flattenOutlineItems(item.children ?? [])]);
}

function handleStructuralResult<T>(
  result: { kind: string; message?: string },
  recordFailure: (reason: string) => void,
): result is { kind: "success"; data: T } {
  if (result.kind === "success") return true;
  recordFailure(result.message ?? result.kind);
  return false;
}

const TYPE_LIKE_KINDS = new Set(["class", "interface", "type", "enum"]);

function createStructuredMatcher(pattern: string): (value: string) => boolean {
  const ignoreCase = !/[A-Z]/.test(pattern);
  const needle = ignoreCase ? pattern.toLowerCase() : pattern;
  return (value: string) => {
    const haystack = ignoreCase ? value.toLowerCase() : value;
    return haystack.includes(needle);
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Structural provider failed.";
}
