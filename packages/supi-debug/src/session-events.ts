import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  type DebugEventQuery,
  type DebugEventView,
  isDebugLevel,
  matchesDebugEventQuery,
  redactDebugData,
} from "@mrclrchtr/supi-core/debug";

/** Custom session-entry type used for sanitized debug-event persistence. */
export const DEBUG_EVENT_ENTRY_TYPE = "supi-debug-event";

type PersistedDebugEventQuery = Pick<DebugEventQuery, "source" | "level" | "category" | "limit">;

/** Sanitized events and total persisted entries found in one PI session file. */
export interface SessionDebugEvents {
  events: DebugEventView[];
  persistedEventCount: number;
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
    (event.cwd !== undefined && typeof event.cwd !== "string")
  ) {
    return undefined;
  }

  return {
    id: event.id,
    timestamp: event.timestamp,
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

/** Read sanitized debug events persisted by SuPi Debug from a PI session file. */
export async function readSessionDebugEvents(
  sessionFile: string,
  query: PersistedDebugEventQuery = {},
): Promise<SessionDebugEvents> {
  const events: DebugEventView[] = [];
  let persistedEventCount = 0;
  const lines = createInterface({
    input: createReadStream(sessionFile, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of lines) {
    const entry = parseDebugEntry(line);
    if (
      typeof entry !== "object" ||
      entry === null ||
      (entry as Record<string, unknown>).type !== "custom" ||
      (entry as Record<string, unknown>).customType !== DEBUG_EVENT_ENTRY_TYPE
    ) {
      continue;
    }

    persistedEventCount++;
    const event = parsePersistedEvent((entry as Record<string, unknown>).data);
    if (event && matchesDebugEventQuery(event, query)) events.push(event);
  }

  const limit = query.limit && query.limit > 0 ? Math.floor(query.limit) : Number.POSITIVE_INFINITY;
  return {
    events: events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
    persistedEventCount,
  };
}
