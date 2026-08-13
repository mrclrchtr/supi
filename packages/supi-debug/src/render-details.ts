import type { TruncationResult } from "@earendil-works/pi-coding-agent";
import {
  type DebugAgentAccess,
  type DebugEventView,
  isDebugLevel,
} from "@mrclrchtr/supi-core/debug";

const MAX_RENDER_EVENTS = 12;
const MAX_EVENT_VALUE_DEPTH = 6;
const MAX_EVENT_VALUE_CHARS = 1_200;
const MAX_EVENT_VALUE_ITEMS = 256;
const MAX_EVENT_STRING_CHARS = 300;
const MAX_EVENT_TEXT_CHARS = 1_000;

/** Small truncation facts used by transcript renderers. */
export interface DebugOutputTruncation {
  truncated: true;
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}

/** Stable, bounded facts used by the debug tool and its transcript renderers. */
export type DebugRenderEvent = Omit<DebugEventView, "rawData">;

export interface DebugRenderDetails {
  enabled?: boolean;
  agentAccess?: DebugAgentAccess;
  sessionFile?: string;
  rawAccessDenied: boolean;
  rawDataUnavailable: boolean;
  events: DebugRenderEvent[];
  eventCount: number;
  omittedEventCount: number;
  eventDataTruncated: boolean;
  persistedEventCount?: number;
  truncation?: DebugOutputTruncation;
  emptyReason?: "no-persisted-events" | "no-matches";
}

interface DetailValueState {
  remainingChars: number;
  remainingItems: number;
  truncated: boolean;
  seen: WeakSet<object>;
}

interface CreateDebugRenderDetailsOptions {
  enabled?: boolean;
  agentAccess?: DebugAgentAccess;
  sessionFile?: string;
  rawAccessDenied?: boolean;
  rawDataUnavailable?: boolean;
  persistedEventCount?: number;
  truncation?: TruncationResult;
  eventCount?: number;
  emptyReason?: "no-persisted-events" | "no-matches";
}

function boundedText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return { value: `${value.slice(0, Math.max(0, maxChars - 1))}…`, truncated: true };
}

function boundedCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function takeItem(state: DetailValueState): boolean {
  if (state.remainingItems <= 0) {
    state.truncated = true;
    return false;
  }
  state.remainingItems--;
  return true;
}

function takeChars(state: DetailValueState, value: string): string {
  if (state.remainingChars <= 0) {
    state.truncated = true;
    return "[Truncated]";
  }

  const maxChars = Math.min(MAX_EVENT_STRING_CHARS, state.remainingChars);
  state.remainingChars -= maxChars;
  if (value.length <= maxChars) return value;

  state.truncated = true;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function boundArray(value: unknown[], state: DetailValueState, depth: number): unknown[] {
  const items: unknown[] = [];
  for (const item of value) {
    if (state.remainingChars <= 0 || state.remainingItems <= 0) {
      state.truncated = true;
      break;
    }
    items.push(boundValue(item, state, depth + 1));
  }
  if (items.length < value.length) {
    state.truncated = true;
    items.push("[Truncated]");
  }
  return items;
}

function boundObject(
  value: Record<string, unknown>,
  state: DetailValueState,
  depth: number,
): Record<string, unknown> | string {
  const objectValue: Record<string, unknown> = {};
  let omittedEntries = false;

  try {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (state.remainingChars <= 0 || state.remainingItems <= 0) {
        state.truncated = true;
        omittedEntries = true;
        break;
      }
      const boundedKey = takeChars(state, key);
      objectValue[boundedKey] = boundValue(value[key], state, depth + 1);
    }
  } catch {
    state.truncated = true;
    return "[Unserializable]";
  }

  if (omittedEntries) {
    state.truncated = true;
    objectValue["[Truncated]"] = true;
  }
  return objectValue;
}

function boundReference(value: object, state: DetailValueState, depth: number): unknown {
  if (depth >= MAX_EVENT_VALUE_DEPTH) {
    state.truncated = true;
    return "[MaxDepth]";
  }
  if (state.seen.has(value)) {
    state.truncated = true;
    return "[Circular]";
  }
  state.seen.add(value);
  return Array.isArray(value)
    ? boundArray(value, state, depth)
    : boundObject(value as Record<string, unknown>, state, depth);
}

function boundValue(value: unknown, state: DetailValueState, depth: number): unknown {
  if (!takeItem(state)) return "[Truncated]";
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return takeChars(state, value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : takeChars(state, String(value));
  if (typeof value === "bigint") return takeChars(state, `${value}n`);
  if (typeof value === "function" || typeof value === "symbol") {
    return takeChars(state, String(value));
  }
  return boundReference(value, state, depth);
}

function boundEvent(event: DebugEventView): { event: DebugRenderEvent; truncated: boolean } {
  const state: DetailValueState = {
    remainingChars: MAX_EVENT_VALUE_CHARS,
    remainingItems: MAX_EVENT_VALUE_ITEMS,
    truncated: false,
    seen: new WeakSet<object>(),
  };
  const source = boundedText(String(event.source), MAX_EVENT_STRING_CHARS);
  const category = boundedText(String(event.category), MAX_EVENT_STRING_CHARS);
  const message = boundedText(String(event.message), MAX_EVENT_TEXT_CHARS);
  const cwd =
    event.cwd === undefined ? undefined : boundedText(String(event.cwd), MAX_EVENT_STRING_CHARS);
  const operationId =
    event.operationId === undefined
      ? undefined
      : boundedText(String(event.operationId), MAX_EVENT_STRING_CHARS);

  const boundedEvent: DebugRenderEvent = {
    id: Number.isFinite(event.id) ? event.id : 0,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : 0,
    ...(operationId ? { operationId: operationId.value } : {}),
    source: source.value,
    level: event.level,
    category: category.value,
    message: message.value,
    ...(cwd ? { cwd: cwd.value } : {}),
    ...(event.data === undefined ? {} : { data: boundValue(event.data, state, 0) }),
  };

  return {
    event: boundedEvent,
    truncated:
      source.truncated ||
      category.truncated ||
      message.truncated ||
      Boolean(cwd?.truncated) ||
      Boolean(operationId?.truncated) ||
      state.truncated,
  };
}

function summarizeTruncation(
  truncation: TruncationResult | undefined,
): DebugOutputTruncation | undefined {
  if (!truncation?.truncated) return undefined;
  return {
    truncated: true,
    outputLines: truncation.outputLines,
    totalLines: truncation.totalLines,
    outputBytes: truncation.outputBytes,
    totalBytes: truncation.totalBytes,
  };
}

/** Build bounded, JSON-safe details for tool and message transcript surfaces. */
export function createDebugRenderDetails(
  events: readonly DebugEventView[],
  options: CreateDebugRenderDetailsOptions = {},
): DebugRenderDetails {
  const boundedEvents = events.slice(0, MAX_RENDER_EVENTS).map(boundEvent);
  const eventDataTruncated = boundedEvents.some((entry) => entry.truncated);
  const eventCount = Math.max(events.length, boundedCount(options.eventCount, events.length));

  return {
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    ...(options.agentAccess === undefined ? {} : { agentAccess: options.agentAccess }),
    ...(options.sessionFile === undefined
      ? {}
      : { sessionFile: boundedText(options.sessionFile, MAX_EVENT_STRING_CHARS).value }),
    rawAccessDenied: options.rawAccessDenied === true,
    rawDataUnavailable: options.rawDataUnavailable === true,
    events: boundedEvents.map((entry) => entry.event),
    eventCount,
    omittedEventCount: Math.max(0, eventCount - boundedEvents.length),
    eventDataTruncated,
    ...(options.persistedEventCount === undefined
      ? {}
      : { persistedEventCount: boundedCount(options.persistedEventCount, 0) }),
    ...(options.emptyReason === undefined ? {} : { emptyReason: options.emptyReason }),
    ...(summarizeTruncation(options.truncation)
      ? { truncation: summarizeTruncation(options.truncation) }
      : {}),
  };
}

function parseEvent(value: unknown): DebugEventView | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "number" ||
    !Number.isFinite(record.id) ||
    typeof record.timestamp !== "number" ||
    !Number.isFinite(record.timestamp) ||
    typeof record.source !== "string" ||
    !isDebugLevel(record.level) ||
    typeof record.category !== "string" ||
    typeof record.message !== "string"
  ) {
    return undefined;
  }

  return {
    id: record.id,
    timestamp: record.timestamp,
    source: record.source,
    level: record.level,
    category: record.category,
    message: record.message,
    ...(typeof record.operationId === "string" ? { operationId: record.operationId } : {}),
    ...(typeof record.cwd === "string" ? { cwd: record.cwd } : {}),
    ...(record.data === undefined ? {} : { data: record.data }),
  };
}

function parseTruncation(value: unknown): DebugOutputTruncation | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.truncated !== true) return undefined;
  return {
    truncated: true,
    outputLines: boundedCount(record.outputLines, 0),
    totalLines: boundedCount(record.totalLines, 0),
    outputBytes: boundedCount(record.outputBytes, 0),
    totalBytes: boundedCount(record.totalBytes, 0),
  };
}

/** Read old or malformed message details without allowing the renderer to throw. */
export function readDebugRenderDetails(value: unknown): DebugRenderDetails {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const events = Array.isArray(record.events)
    ? record.events.flatMap((event) => {
        const parsed = parseEvent(event);
        return parsed ? [parsed] : [];
      })
    : [];
  const details = createDebugRenderDetails(events, {
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    agentAccess:
      record.agentAccess === "off" ||
      record.agentAccess === "sanitized" ||
      record.agentAccess === "raw"
        ? record.agentAccess
        : undefined,
    sessionFile: typeof record.sessionFile === "string" ? record.sessionFile : undefined,
    rawAccessDenied: record.rawAccessDenied === true,
    rawDataUnavailable: record.rawDataUnavailable === true,
    emptyReason:
      record.emptyReason === "no-persisted-events" || record.emptyReason === "no-matches"
        ? record.emptyReason
        : undefined,
    persistedEventCount:
      typeof record.persistedEventCount === "number" ? record.persistedEventCount : undefined,
    eventCount: boundedCount(record.eventCount, events.length),
  });

  const parsedTruncation = parseTruncation(record.truncation);
  if (parsedTruncation) details.truncation = parsedTruncation;
  details.eventDataTruncated = details.eventDataTruncated || record.eventDataTruncated === true;
  details.omittedEventCount = Math.max(
    details.omittedEventCount,
    boundedCount(record.omittedEventCount, details.omittedEventCount),
  );
  return details;
}
