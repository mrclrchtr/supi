import {
  type CodeRequestControl,
  type CodeResult,
  isCodeRequestDeadlineError,
  isCodeRequestInterruption,
  type OutlineData,
  type SourceRange,
  type StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { CodeFindAstKind } from "../../tool/code_find/ast-kinds.ts";
import type { AstScanLimitation } from "./ast-scan.ts";
import { callableExpressionForMatching } from "./call-name.ts";
import { type DeadlineOutcome, type ScheduleDeadline, settleByDeadline } from "./deadline.ts";
import { relativeDisplayPath } from "./paths.ts";

export interface StructuredPatternParams {
  readonly pattern: string;
  readonly kind: CodeFindAstKind;
}

export interface StructuredMatch {
  readonly file: string;
  readonly name: string;
  /** Display kind: native kind when available, otherwise common structural kind. */
  readonly kind: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
  readonly commonKind?: string;
  readonly nativeKind?: string;
}

export type StructuredFailureKind = Exclude<CodeResult<never>, { kind: "success" }>["kind"];

export interface StructuredFailure {
  readonly file: string;
  readonly kind: StructuredFailureKind;
  readonly reason: string;
  readonly errorRanges?: readonly SourceRange[];
}

export type StructuredScanLimitation =
  | AstScanLimitation
  | ProviderScanLimitation
  | SyntaxRecoveryScanLimitation;

export interface ProviderScanLimitation {
  readonly reason: "provider-failure";
  readonly pathCount: number;
  readonly examples: readonly string[];
}

/** Recovered syntax files that limit the scan without losing collected matches. */
export interface SyntaxRecoveryScanLimitation {
  readonly reason: "syntax-recovery";
  readonly pathCount: number;
  readonly examples: readonly string[];
}

export interface StructuredFileAnalysis {
  readonly matches: StructuredMatch[];
  readonly failures: StructuredFailure[];
  readonly limitations: StructuredScanLimitation[];
  readonly analyzedFileCount: number;
}

interface AnalyzeStructuredFilesOptions {
  readonly files: readonly string[];
  readonly displayBase: string;
  readonly params: StructuredPatternParams;
  readonly structural: StructuralSubstrate;
  readonly deadline: number;
  readonly now: () => number;
  readonly signal?: AbortSignal;
  /** Timer seam for deterministic deadline tests; defaults to wall-clock timers. */
  readonly schedule?: ScheduleDeadline;
  readonly requestControl: CodeRequestControl;
  readonly initialLimitations: readonly AstScanLimitation[];
}

/** Analyze enumerated files through the operation-specific structural provider method. */
export async function analyzeStructuredFiles(
  options: AnalyzeStructuredFilesOptions,
): Promise<StructuredFileAnalysis> {
  const matches: StructuredMatch[] = [];
  const failures: StructuredFailure[] = [];
  const limitations: StructuredScanLimitation[] = [...options.initialLimitations];
  const matcher = createStructuredMatcher(options.params.pattern);
  let analyzedFileCount = 0;

  for (const [index, absoluteFile] of options.files.entries()) {
    options.signal?.throwIfAborted();
    if (options.now() >= options.deadline) {
      addAnalysisTimeout(limitations, options.files.slice(index), options.displayBase);
      break;
    }
    const relativeFile = relativeDisplayPath(options.displayBase, absoluteFile);
    const fileMatches: StructuredMatch[] = [];
    const fileFailures: StructuredFailure[] = [];
    let outcome: DeadlineOutcome<void>;
    try {
      outcome = await settleByDeadline(
        async () => {
          try {
            await collectMatchesForFile(
              fileMatches,
              fileFailures,
              options.structural,
              relativeFile,
              options.params.kind,
              matcher,
              options.requestControl,
            );
          } catch (error) {
            if (isCodeRequestInterruption(error, options.requestControl)) throw error;
            fileFailures.push({
              file: relativeFile,
              kind: "runtime-error",
              reason: errorMessage(error),
            });
          }
        },
        {
          deadline: options.deadline,
          now: options.now,
          signal: options.signal,
          schedule: options.schedule,
        },
      );
    } catch (error) {
      if (!isCodeRequestDeadlineError(error)) throw error;
      addAnalysisTimeout(limitations, options.files.slice(index), options.displayBase);
      break;
    }
    if (outcome.kind === "timeout") {
      addAnalysisTimeout(limitations, options.files.slice(index), options.displayBase);
      break;
    }
    options.signal?.throwIfAborted();
    matches.push(...fileMatches);
    failures.push(...fileFailures);
    if (fileFailures.length === 0) analyzedFileCount += 1;
  }

  const recoveredFiles = failures.filter((failure) => failure.kind === "partial");
  if (recoveredFiles.length > 0) {
    limitations.push({
      reason: "syntax-recovery",
      pathCount: recoveredFiles.length,
      examples: recoveredFiles.slice(0, 5).map((failure) => failure.file),
    });
  }
  const failedFiles = failures.filter((failure) => failure.kind !== "partial");
  if (failedFiles.length > 0) {
    limitations.push({
      reason: "provider-failure",
      pathCount: failedFiles.length,
      examples: failedFiles.slice(0, 5).map((failure) => failure.file),
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

// biome-ignore lint/complexity/useMaxParams: helper takes explicit collection inputs to avoid intermediate objects in the hot path
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: kind-specific tree-sitter matching is clearest as one helper
async function collectMatchesForFile(
  matches: StructuredMatch[],
  failures: StructuredFailure[],
  structural: StructuralSubstrate,
  relFile: string,
  kind: CodeFindAstKind,
  matcher: (value: string) => boolean,
  requestControl: CodeRequestControl,
): Promise<void> {
  const recordFailure = (
    failureKind: StructuredFailureKind,
    reason: string,
    errorRanges?: readonly SourceRange[],
  ) => {
    failures.push({
      file: relFile,
      kind: failureKind,
      reason,
      ...(errorRanges ? { errorRanges } : {}),
    });
  };

  if (kind === "definition") {
    const outline = await structural.outline(relFile, requestControl);
    if (!handleStructuralResult(outline, recordFailure)) return;
    for (const item of flattenOutlineItems(outline.data)) {
      if (!matcher(item.name)) continue;
      matches.push(outlineMatch(relFile, item));
    }
    return;
  }

  if (kind === "export") {
    const exportsResult = await structural.exports(relFile, requestControl);
    if (!handleStructuralResult(exportsResult, recordFailure)) return;
    for (const item of exportsResult.data) {
      if (!matcher(item.name)) continue;
      matches.push({
        file: relFile,
        name: item.name,
        kind: item.kind,
        line: item.startLine,
        startCharacter: item.startCharacter,
        endLine: item.endLine,
        endCharacter: item.endCharacter,
      });
    }
    return;
  }

  if (kind === "import") {
    const importsResult = await structural.imports(relFile, requestControl);
    if (!handleStructuralResult(importsResult, recordFailure)) return;
    for (const item of importsResult.data) {
      if (!matcher(item.moduleSpecifier)) continue;
      matches.push({
        file: relFile,
        name: item.moduleSpecifier,
        kind: "import",
        line: item.startLine,
        startCharacter: item.startCharacter,
        endLine: item.endLine,
        endCharacter: item.endCharacter,
      });
    }
    return;
  }

  if (kind === "call") {
    const callResult = await structural.callSites(relFile, requestControl);
    if (!handleStructuralResult(callResult, recordFailure)) return;
    for (const call of callResult.data) {
      if (!matcher(callableExpressionForMatching(call.name))) continue;
      matches.push({
        file: relFile,
        name: call.name,
        kind: "call",
        line: call.startLine,
        startCharacter: call.startCharacter,
        endLine: call.endLine,
        endCharacter: call.endCharacter,
      });
    }
    return;
  }

  const outline = await structural.outline(relFile, requestControl);
  if (!handleStructuralResult(outline, recordFailure)) return;
  for (const item of flattenOutlineItems(outline.data)) {
    if (kind === "type" && !TYPE_KIND.test(item.kind.toLowerCase())) continue;
    if (kind === "interface" && item.kind.toLowerCase() !== "interface") continue;
    if (kind === "class" && item.kind.toLowerCase() !== "class") continue;
    if (kind === "method" && item.kind.toLowerCase() !== "method") continue;
    if (kind === "enum" && item.kind.toLowerCase() !== "enum") continue;
    if (!matcher(item.name)) continue;
    matches.push(outlineMatch(relFile, item));
  }
}

/** Flatten provider outlines so nested class/interface/enum declarations remain searchable. */
function outlineMatch(file: string, item: OutlineData): StructuredMatch {
  return {
    file,
    name: item.name,
    kind: item.nativeKind ?? item.kind,
    ...(item.nativeKind ? { commonKind: item.kind, nativeKind: item.nativeKind } : {}),
    line: item.startLine,
    startCharacter: item.startCharacter,
    endLine: item.endLine,
    endCharacter: item.endCharacter,
  };
}

function flattenOutlineItems(items: readonly OutlineData[]): OutlineData[] {
  return items.flatMap((item) => [item, ...flattenOutlineItems(item.children ?? [])]);
}

type StructuralDataResult<T> = Extract<CodeResult<T>, { kind: "success" | "partial" }>;

function handleStructuralResult<T>(
  result: CodeResult<T>,
  recordFailure: (
    kind: StructuredFailureKind,
    reason: string,
    errorRanges?: readonly SourceRange[],
  ) => void,
): result is StructuralDataResult<T> {
  if (result.kind === "success") return true;
  if (result.kind === "partial") {
    recordFailure("partial", result.reason, result.errorRanges);
    return true;
  }
  recordFailure(result.kind, result.message);
  return false;
}

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

const TYPE_KIND = /^(?:class|interface|type|enum|struct|union|record|object|concept)$/;
