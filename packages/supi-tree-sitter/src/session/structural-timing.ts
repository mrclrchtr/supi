import { startDebugTimer } from "@mrclrchtr/supi-core/debug";
import type { GrammarId } from "../types.ts";
import type { StructuralCacheObservation } from "./parsed-file-store.ts";

export type StructuralTimer = ReturnType<typeof startDebugTimer>;
export type ParserState = "cold" | "initializing" | "reused";
export type ParseTimingPhase =
  | "cache-lookup"
  | "content-hash"
  | "file-read"
  | "parse"
  | "parser-setup";
export type QueryTimingPhase = "query-compilation" | "query-execution";

export type StructuralTimingObservation =
  | {
      readonly operation: "parse";
      readonly grammar: GrammarId;
      readonly parserState: ParserState;
      readonly outcome:
        | "cancelled"
        | "completed"
        | "file-access-error"
        | "runtime-error"
        | "timeout";
      readonly cache?: StructuralCacheObservation;
      readonly finalPhase: ParseTimingPhase;
    }
  | {
      readonly operation: "query";
      readonly grammar: GrammarId;
      readonly outcome:
        | "cancelled"
        | "completed"
        | "runtime-error"
        | "timeout"
        | "validation-error";
      readonly captureCount: number;
      readonly cache: StructuralCacheObservation;
      readonly finalPhase: QueryTimingPhase;
    };

/** Start one failure-isolated Tree-sitter timing observation. */
export function startStructuralTiming(): StructuralTimer {
  return startDebugTimer();
}

/** Finish one sanitized Tree-sitter timing observation. */
export function finishStructuralTiming(
  timer: StructuralTimer,
  observation: StructuralTimingObservation,
): void {
  const { finalPhase, ...data } = observation;
  timer.finish(
    () => ({
      source: "tree-sitter",
      level: "debug",
      category: `structural.${data.operation}.timing`,
      message: `Tree-sitter ${data.operation} ${data.outcome}`,
      data: { ...data },
    }),
    finalPhase,
  );
}
