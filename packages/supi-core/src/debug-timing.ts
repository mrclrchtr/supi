import { performance } from "node:perf_hooks";
import {
  type DebugEvent,
  type DebugEventInput,
  isDebugRegistryEnabled,
  recordDebugEvent,
} from "./debug-registry.ts";

/** Monotonic duration data added to a timed debug event. */
export interface DebugTiming {
  readonly durationMs: number;
  readonly phasesMs: Readonly<Record<string, number>>;
}

/** Debug event input whose data can receive the reserved `timing` field. */
export interface TimedDebugEventInput extends Omit<DebugEventInput, "data"> {
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Test seam for the monotonic clock used by a debug timer. */
export interface DebugTimerOptions {
  readonly now?: () => number;
}

/** Lazy timed-event input that is not evaluated when Debug is disabled. */
export type TimedDebugEventFactory = () => TimedDebugEventInput;

/** One-shot debug timer with optional sequential phase measurements. */
export interface DebugTimer {
  /** Whether this timer sampled Debug as enabled when it started. */
  readonly enabled: boolean;
  /** Finish the current phase and start the next unnamed interval. */
  mark(phase: string): void;
  /** Record one event. A second call returns `null` without recording another event. */
  finish(
    input: TimedDebugEventInput | TimedDebugEventFactory,
    finalPhase?: string,
  ): DebugEvent | null;
}

/**
 * Start a monotonic timer for one debug event.
 *
 * Each `mark(name)` stores the interval since the previous mark. `finish()`
 * stores the total duration and can name the final interval. Repeated phase
 * names are accumulated. Event data reserves the `timing` field. When Debug is
 * disabled at start, this returns a no-op timer and does not read the clock.
 * Pass a factory to `finish()` to avoid event-data construction when disabled.
 * Clock, event-construction, and registry failures are isolated from the
 * measured operation and make the timer a no-op.
 */
export function startDebugTimer(options: DebugTimerOptions = {}): DebugTimer {
  if (!isDebugRegistryEnabled()) return DISABLED_DEBUG_TIMER;
  const now = options.now ?? performance.now.bind(performance);
  let startedAt: number;
  try {
    startedAt = now();
  } catch {
    return DISABLED_DEBUG_TIMER;
  }
  let previousAt = startedAt;
  let finished = false;
  let failed = false;
  const phases = new Map<string, number>();

  const markAt = (phase: string, current: number): void => {
    const name = phase.trim();
    if (!name) return;
    phases.set(name, (phases.get(name) ?? 0) + Math.max(0, current - previousAt));
    previousAt = current;
  };

  return {
    enabled: true,
    mark(phase) {
      if (finished || failed) return;
      try {
        markAt(phase, now());
      } catch {
        failed = true;
      }
    },
    finish(input, finalPhase) {
      if (finished || failed) return null;
      finished = true;
      try {
        if (!isDebugRegistryEnabled()) return null;
        const completedAt = now();
        if (finalPhase) markAt(finalPhase, completedAt);
        const phasesMs = Object.fromEntries(
          [...phases.entries()].map(([name, value]) => [name, duration(value)]),
        );
        const timing: DebugTiming = {
          durationMs: duration(completedAt - startedAt),
          phasesMs,
        };
        const eventInput = typeof input === "function" ? input() : input;
        return recordDebugEvent({
          ...eventInput,
          data: { ...eventInput.data, timing },
        });
      } catch {
        return null;
      }
    },
  };
}

const DISABLED_DEBUG_TIMER: DebugTimer = Object.freeze({
  enabled: false,
  mark() {},
  finish() {
    return null;
  },
});

function duration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 10) / 10;
}
