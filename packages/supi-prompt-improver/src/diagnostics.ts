import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { DebugLevel } from "@mrclrchtr/supi-core/debug";
import { isDebugRegistryEnabled, recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { boundDiagnosticData, PROMPT_IMPROVER_DEBUG_LIMITS } from "./diagnostic-data.ts";

export { PROMPT_IMPROVER_DEBUG_LIMITS } from "./diagnostic-data.ts";
export {
  capturePromptImproverError,
  capturePromptImproverResponse,
} from "./diagnostic-snapshot.ts";

const SOURCE = "prompt-improver";

/** Optional producer for bounded prompt-improver diagnostics. */
export interface PromptImproverDiagnostics {
  readonly runId?: string;
  record(
    category: string,
    level: DebugLevel,
    message: string,
    data: () => Record<string, unknown>,
  ): void;
  startClock(): number | undefined;
  durationSince(startedAt: number | undefined): number | undefined;
  finish(outcome: string, reasonCode: string): void;
  invalidate(): void;
}

/** Create a no-op producer unless capture is enabled for the original session. */
export function createPromptImproverDiagnostics(
  readSessionId?: () => string,
): PromptImproverDiagnostics {
  let enabled = false;
  let sessionId: string | undefined;
  let sessionReader = readSessionId;
  try {
    enabled = isDebugRegistryEnabled();
  } catch {
    // A registry failure must not affect prompt improvement.
  }
  if (enabled) {
    try {
      sessionId = sessionReader?.();
    } catch {
      sessionReader = undefined;
    }
  } else {
    sessionReader = undefined;
  }
  const sessionBound = typeof sessionId === "string" && sessionReader !== undefined;
  let runId: string | undefined;
  try {
    if (enabled && sessionBound) runId = randomUUID();
  } catch {
    // Keep diagnostics disabled if ID creation fails.
  }
  const runStartedAt = runId ? monotonicNow() : undefined;
  let eventCount = 0;
  let finished = !runId;

  const currentSession = (): boolean => {
    if (finished || !sessionBound || !sessionReader) return false;
    try {
      if (sessionReader() === sessionId) return true;
    } catch {
      // Treat a failed session lookup as a session change.
    }
    finished = true;
    sessionReader = undefined;
    return false;
  };

  return {
    runId,
    record(category, level, message, data) {
      if (!runId || finished || !currentSession() || !canRecord(runId, finished, eventCount))
        return;
      try {
        const bounded = boundAndSanitize({ ...data(), runId });
        if (!currentSession()) return;
        eventCount += 1;
        recordBoundedEvent(category, level, message, bounded);
      } catch {
        // Diagnostics must not change prompt-improver behavior.
      }
    },
    startClock: () => {
      if (!runId || finished || !currentSession() || !registryEnabled()) return undefined;
      return monotonicNow();
    },
    durationSince: (startedAt) => {
      if (!runId || finished || !currentSession() || !registryEnabled()) return undefined;
      return durationSince(startedAt);
    },
    finish(outcome, reasonCode) {
      if (!runId || finished) return;
      if (!currentSession()) return;
      finished = true;
      try {
        if (!registryEnabled() || eventCount >= PROMPT_IMPROVER_DEBUG_LIMITS.eventsPerRun) return;
        const bounded = boundAndSanitize({
          runId,
          outcome,
          reasonCode,
          durationMs: durationSince(runStartedAt),
        });
        recordBoundedEvent(
          "run.terminal",
          outcome === "failed" || outcome === "stale" ? "warning" : "info",
          "Prompt improvement run finished",
          bounded,
        );
      } catch {
        // Diagnostics must not change prompt-improver behavior.
      } finally {
        sessionReader = undefined;
      }
    },
    invalidate() {
      finished = true;
      sessionReader = undefined;
    },
  };
}

function canRecord(runId: string | undefined, finished: boolean, eventCount: number): boolean {
  return Boolean(
    runId &&
      !finished &&
      eventCount < PROMPT_IMPROVER_DEBUG_LIMITS.eventsPerRun &&
      registryEnabled(),
  );
}

function registryEnabled(): boolean {
  try {
    return isDebugRegistryEnabled();
  } catch {
    return false;
  }
}

function boundAndSanitize(value: unknown): ReturnType<typeof boundDiagnosticData> {
  return boundDiagnosticData(value, { sanitizeStrings: true });
}

function recordBoundedEvent(
  category: string,
  level: DebugLevel,
  message: string,
  bounded: ReturnType<typeof boundDiagnosticData>,
): void {
  recordDebugEvent({
    source: SOURCE,
    level,
    category,
    message,
    data: bounded.value,
  });
}

function durationSince(startedAt: number | undefined): number | undefined {
  if (startedAt === undefined) return undefined;
  const current = monotonicNow();
  if (current === undefined) return undefined;
  return roundDuration(current - startedAt);
}

function monotonicNow(): number | undefined {
  try {
    return performance.now();
  } catch {
    return undefined;
  }
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 10) / 10;
}
