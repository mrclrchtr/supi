import type { StructuralProvider as StructuralSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import type { StructuralSearchOperation } from "@mrclrchtr/supi-tree-sitter/api";
import type { CodeFindAstKind } from "../../tool/find/ast-kinds.ts";
import type { EvidencePartialReason } from "../evidence.ts";
import {
  type AstScanExclusion,
  type AstScanOperations,
  type AstScanPolicy,
  DEFAULT_AST_SCAN_MAX_FILES,
  DEFAULT_AST_SCAN_TIMEOUT_MS,
  enumerateAstFiles,
} from "./ast-scan.ts";
import { startAstScanTimer } from "./ast-scan-timing.ts";
import { relativeDisplayPath } from "./paths.ts";
import {
  analyzeStructuredFiles,
  type StructuredFailure,
  type StructuredMatch,
  type StructuredPatternParams,
  type StructuredScanLimitation,
} from "./pattern-analysis.ts";

export type {
  ProviderScanLimitation,
  StructuredFailure,
  StructuredFailureKind,
  StructuredMatch,
  StructuredPatternParams,
  StructuredScanLimitation,
} from "./pattern-analysis.ts";

/** Structured completeness state for the AST source-file scan. */
export interface StructuredScanSummary {
  readonly universe: "structural-operation-supported-files";
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
  readonly operationId?: string;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly operations?: AstScanOperations;
  readonly maxFiles?: number;
  readonly timeoutMs?: number;
  /** Optional caller deadline; the earlier caller/policy deadline wins. */
  readonly deadline?: number;
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
  const scanTimer = startAstScanTimer(options.control, options.cwd);
  const now = options.control?.now ?? Date.now;
  const maxFiles = options.control?.maxFiles ?? DEFAULT_AST_SCAN_MAX_FILES;
  const timeoutMs = options.control?.timeoutMs ?? DEFAULT_AST_SCAN_TIMEOUT_MS;
  const policyDeadline = now() + timeoutMs;
  const deadline = Math.min(options.control?.deadline ?? Number.POSITIVE_INFINITY, policyDeadline);
  const roots = Array.isArray(options.roots) ? [...options.roots] : [options.roots];
  const operation = structuralOperationForKind(options.params.kind);
  options.control?.signal?.throwIfAborted();

  const enumeration = await enumerateAstFiles({
    cwd: options.cwd,
    roots,
    operation,
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
  if (
    enumeration.files.length === 0 &&
    enumeration.complete &&
    enumeration.exclusions.some((exclusion) => exclusion.reason === "unsupported-operation")
  ) {
    return {
      kind: "unavailable",
      reason: `No file in the requested scope supports AST ${options.params.kind} search.`,
    };
  }

  scanTimer.enumerationCompleted();
  const requestControl = {
    operationId: options.control?.operationId,
    signal: options.control?.signal,
    deadline,
  };
  const analysis = await analyzeStructuredFiles({
    files: enumeration.files,
    displayBase: enumeration.displayBase,
    params: options.params,
    structural: options.structural,
    deadline,
    now,
    signal: options.control?.signal,
    requestControl,
    initialLimitations: enumeration.limitations,
  });
  const capabilityMismatches = analysis.failures.filter(
    (failure) => failure.kind === "unsupported-language",
  );
  const complete = enumeration.complete && analysis.limitations.length === 0;
  scanTimer.record({ context: options, operation, roots, enumeration, analysis, complete });
  if (capabilityMismatches.length > 0) {
    return {
      kind: "unavailable",
      reason: `Structural provider rejected ${capabilityMismatches.length} file${capabilityMismatches.length === 1 ? "" : "s"} declared eligible for ${operation} analysis.`,
    };
  }
  return {
    kind: "completed",
    result: {
      matches: analysis.matches,
      failures: analysis.failures,
      partialReason: complete ? null : primaryPartialReason(analysis.limitations),
      scan: {
        universe: "structural-operation-supported-files",
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

const AST_KIND_OPERATIONS = {
  definition: "outline",
  import: "imports",
  export: "exports",
  call: "call-sites",
  type: "outline",
  interface: "outline",
  class: "outline",
  method: "outline",
  enum: "outline",
} as const satisfies Record<CodeFindAstKind, StructuralSearchOperation>;

function structuralOperationForKind(kind: CodeFindAstKind): StructuralSearchOperation {
  return AST_KIND_OPERATIONS[kind];
}
