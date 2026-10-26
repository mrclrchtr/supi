import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  DEBUG_EVENT_ENTRY_TYPE,
  type DebugEventQuery,
  type DebugEventView,
  isDebugLevel,
  isDebugOperationId,
  matchesDebugEventQuery,
  redactDebugData,
} from "@mrclrchtr/supi-core/debug";

/** Shared custom entry type for sanitized session-local debug events. */
export { DEBUG_EVENT_ENTRY_TYPE };

type PersistedDebugEventQuery = Pick<
  DebugEventQuery,
  "operationId" | "source" | "level" | "category" | "limit"
>;

/** Sanitized selection and scan totals from one PI session file. */
export interface SessionDebugEvents {
  events: DebugEventView[];
  persistedEventCount: number;
  /** Valid matching events before the query limit is applied. */
  matchedEventCount: number;
  /** Recognized debug entries whose event payload could not be validated. */
  invalidEventCount: number;
  /** Nonblank JSONL lines that could not be parsed; their event identity is unknown. */
  malformedLineCount: number;
}

/** Small progress facts emitted while a persisted session file is scanned. */
export interface SessionDebugReadProgress {
  scannedLines: number;
  persistedEventCount: number;
  matchedEvents: number;
}

/** Optional cancellation and progress controls for persisted-session reads. */
export interface SessionDebugReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SessionDebugReadProgress) => void;
}

function parsePersistedEvent(data: unknown): DebugEventView | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const event = data as Record<string, unknown>;
  if (
    typeof event.id !== "number" ||
    !Number.isFinite(event.id) ||
    typeof event.timestamp !== "number" ||
    !Number.isFinite(event.timestamp) ||
    typeof event.source !== "string" ||
    !isDebugLevel(event.level) ||
    typeof event.category !== "string" ||
    typeof event.message !== "string" ||
    (event.operationId !== undefined && !isDebugOperationId(event.operationId)) ||
    (event.cwd !== undefined && typeof event.cwd !== "string")
  ) {
    return undefined;
  }

  return {
    id: event.id,
    timestamp: event.timestamp,
    operationId: event.operationId,
    source: event.source,
    level: event.level,
    category: event.category,
    message: event.message,
    cwd: event.cwd,
    data: event.data === undefined ? undefined : redactDebugData(event.data),
  };
}

function parseSessionLine(line: string): { entry?: unknown; malformed: boolean } {
  if (!line.trim()) return { malformed: false };
  try {
    return { entry: JSON.parse(line), malformed: false };
  } catch {
    // Do not retain line contents: damaged rows can contain unsanitized session data.
    return { malformed: true };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Persisted debug-event scan was canceled.");
  error.name = "AbortError";
  throw error;
}

function reportProgress(
  onProgress: SessionDebugReadOptions["onProgress"],
  progress: SessionDebugReadProgress,
): void {
  onProgress?.(progress);
}

/** Read sanitized debug events persisted by SuPi Debug from a PI session file. */
export async function readSessionDebugEvents(
  sessionFile: string,
  query: PersistedDebugEventQuery = {},
  options: SessionDebugReadOptions = {},
): Promise<SessionDebugEvents> {
  const events: DebugEventView[] = [];
  let persistedEventCount = 0;
  let invalidEventCount = 0;
  let malformedLineCount = 0;
  let scannedLines = 0;
  throwIfAborted(options.signal);

  const input = createReadStream(sessionFile, { encoding: "utf8" });
  const abortHandler = () => input.destroy();
  options.signal?.addEventListener("abort", abortHandler, { once: true });
  const lines = createInterface({
    input,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  try {
    throwIfAborted(options.signal);
    reportProgress(options.onProgress, { scannedLines, persistedEventCount, matchedEvents: 0 });

    for await (const line of lines) {
      scannedLines++;
      throwIfAborted(options.signal);
      const { entry, malformed } = parseSessionLine(line);
      malformedLineCount += Number(malformed);
      if (
        typeof entry !== "object" ||
        entry === null ||
        (entry as Record<string, unknown>).type !== "custom" ||
        (entry as Record<string, unknown>).customType !== DEBUG_EVENT_ENTRY_TYPE
      ) {
        if (scannedLines % 250 === 0) {
          reportProgress(options.onProgress, {
            scannedLines,
            persistedEventCount,
            matchedEvents: events.length,
          });
        }
        continue;
      }

      persistedEventCount++;
      const event = parsePersistedEvent((entry as Record<string, unknown>).data);
      invalidEventCount += Number(event === undefined);
      if (event && matchesDebugEventQuery(event, query)) events.push(event);

      if (scannedLines % 250 === 0) {
        reportProgress(options.onProgress, {
          scannedLines,
          persistedEventCount,
          matchedEvents: events.length,
        });
      }
    }

    throwIfAborted(options.signal);
    reportProgress(options.onProgress, {
      scannedLines,
      persistedEventCount,
      matchedEvents: events.length,
    });
    throwIfAborted(options.signal);
  } finally {
    options.signal?.removeEventListener("abort", abortHandler);
    lines.close();
    input.destroy();
  }

  const limit = query.limit && query.limit > 0 ? Math.floor(query.limit) : Number.POSITIVE_INFINITY;
  return {
    events: events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
    persistedEventCount,
    matchedEventCount: events.length,
    invalidEventCount,
    malformedLineCount,
  };
}
