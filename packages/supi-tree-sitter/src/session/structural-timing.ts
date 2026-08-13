import { performance } from "node:perf_hooks";
import { recordDebugEvent, startDebugTimer } from "@mrclrchtr/supi-core/debug";
import type { StructuralCacheObservation } from "../worker/parsed-file-store.ts";

/** Plain sanitized event sent from the Structural Worker to the parent. */
export interface StructuralTimingEvent {
  readonly source: "tree-sitter";
  readonly level: "debug";
  readonly category: "structural.parse.timing" | "structural.query.timing";
  readonly message: string;
  readonly data: Readonly<Record<string, unknown>> & {
    readonly timing: {
      readonly durationMs: number;
      readonly phasesMs: Readonly<Record<string, number>>;
    };
  };
}

interface StructuralTimer {
  mark(phase: string): void;
  finish(
    event: Omit<StructuralTimingEvent, "data"> & { data: Record<string, unknown> },
    finalPhase: string,
  ): void;
}

export type ParserState = "cold" | "initializing" | "reused";
export type ParseTimingPhase =
  | "cache-lookup"
  | "content-hash"
  | "file-read"
  | "parse"
  | "parser-setup";
export type QueryTimingPhase = "query-cache" | "query-compilation" | "query-execution";

export type StructuralTimingObservation =
  | {
      readonly operation: "parse";
      readonly grammar: string;
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
      readonly grammar: string;
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
export function startStructuralTiming(
  forward?: (event: StructuralTimingEvent) => void,
): StructuralTimer {
  if (forward) return createForwardedTimer(forward);
  const timer = startDebugTimer();
  return {
    mark(phase) {
      timer.mark(phase);
    },
    finish(event, finalPhase) {
      timer.finish(event, finalPhase);
    },
  };
}

/** Finish one sanitized Tree-sitter timing observation. */
export function finishStructuralTiming(
  timer: StructuralTimer,
  observation: StructuralTimingObservation,
): void {
  const { finalPhase, ...data } = observation;
  timer.finish(
    {
      source: "tree-sitter",
      level: "debug",
      category: `structural.${data.operation}.timing`,
      message: `Tree-sitter ${data.operation} ${data.outcome}`,
      data: { ...data },
    },
    finalPhase,
  );
}

/** Publish one validated Worker timing event into the parent Debug Registry. */
export function publishStructuralTimingEvent(event: StructuralTimingEvent): void {
  recordDebugEvent(event);
}

function createForwardedTimer(forward: (event: StructuralTimingEvent) => void): StructuralTimer {
  const startedAt = performance.now();
  let previousAt = startedAt;
  let finished = false;
  const phases = new Map<string, number>();

  const mark = (phase: string, current: number) => {
    phases.set(phase, (phases.get(phase) ?? 0) + Math.max(0, current - previousAt));
    previousAt = current;
  };

  return {
    mark(phase) {
      if (!finished) mark(phase, performance.now());
    },
    finish(event, finalPhase) {
      if (finished) return;
      finished = true;
      const completedAt = performance.now();
      mark(finalPhase, completedAt);
      forward({
        ...event,
        data: {
          ...event.data,
          timing: {
            durationMs: duration(completedAt - startedAt),
            phasesMs: Object.fromEntries(
              [...phases.entries()].map(([name, value]) => [name, duration(value)]),
            ),
          },
        },
      } as StructuralTimingEvent);
    },
  };
}

function duration(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}
