import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { startDebugTimer } from "@mrclrchtr/supi-core/debug";
import { truncateIdentity } from "@mrclrchtr/supi-lsp/debug-telemetry";
import type { StructuralSearchOperation } from "@mrclrchtr/supi-tree-sitter/api";
import type { StructuredFileAnalysis, StructuredPatternParams } from "./pattern-analysis.ts";

interface ScanContext {
  readonly params: StructuredPatternParams;
}

interface EnumerationMetrics {
  readonly eligibleFileCount: number | null;
}

interface AstScanTimingInput {
  readonly context: ScanContext;
  readonly operation: StructuralSearchOperation;
  readonly roots: readonly string[];
  readonly enumeration: EnumerationMetrics;
  readonly analysis: StructuredFileAnalysis;
  readonly complete: boolean;
}

/** One-shot timer that records aggregate AST scan phases. */
export interface AstScanTimer {
  enumerationCompleted(): void;
  record(input: AstScanTimingInput): void;
}

/** Start one AST scan timer, recording the workspace root as event-level cwd. */
export function startAstScanTimer(
  control: CodeRequestControl | undefined,
  cwd: string,
): AstScanTimer {
  const timer = startDebugTimer();
  return {
    enumerationCompleted() {
      timer.mark("enumeration");
    },
    record(input) {
      timer.finish(
        () => ({
          operationId: control?.operationId,
          source: "code-intelligence",
          level: "debug",
          category: "ast-scan.timing",
          message: `AST ${input.context.params.kind} scan analyzed ${input.analysis.analyzedFileCount} files`,
          cwd: truncateIdentity(cwd),
          data: {
            kind: input.context.params.kind,
            operation: input.operation,
            rootCount: input.roots.length,
            eligibleFileCount: input.enumeration.eligibleFileCount,
            analyzedFileCount: input.analysis.analyzedFileCount,
            matchCount: input.analysis.matches.length,
            failureCount: input.analysis.failures.length,
            complete: input.complete,
          },
        }),
        "analysis",
      );
    },
  };
}
