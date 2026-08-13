import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  type DebugEventQuery,
  type DebugEventView,
  isDebugLevel,
  isDebugOperationId,
  matchesDebugEventQuery,
  redactDebugData,
} from "@mrclrchtr/supi-core/debug";

/** Custom session-entry type used for sanitized debug-event persistence. */
export const DEBUG_EVENT_ENTRY_TYPE = "supi-debug-event";

type PersistedDebugEventQuery = Pick<
  DebugEventQuery,
  "operationId" | "source" | "level" | "category" | "limit"
>;

/** Sanitized events and total persisted entries found in one PI session file. */
export interface SessionDebugEvents {
  events: DebugEventView[];
  persistedEventCount: number;
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

function parseDebugEntry(line: string): unknown {
  if (!line.includes('"customType"')) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
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
      const entry = parseDebugEntry(line);
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
  };
}
