import type { JsonValue } from "@earendil-works/pi-ai";
import type { DebugEventView } from "@mrclrchtr/supi-core/debug";
import type { DebugToolOutput } from "./result-schema.ts";

const MAX_DATA_DEPTH = 64;

interface SerializationState {
  normalized: boolean;
  ancestors: WeakSet<object>;
}

function marker(state: SerializationState, text: string): string {
  state.normalized = true;
  return text;
}

function serializeValue(value: unknown, state: SerializationState, depth: number): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : marker(state, String(value));
  }
  if (typeof value === "bigint") return marker(state, `${value}n`);
  if (typeof value === "undefined") return marker(state, "[Undefined]");
  if (typeof value === "function") return marker(state, "[Function]");
  if (typeof value === "symbol") return marker(state, "[Symbol]");
  if (state.ancestors.has(value)) return marker(state, "[Circular]");
  if (depth >= MAX_DATA_DEPTH) return marker(state, "[MaxDepth]");

  // Never transport runtime instances, invoke toJSON, or copy hidden/private state.
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return marker(state, "[Non-JSON object]");
  }

  state.ancestors.add(value);
  try {
    return Array.isArray(value)
      ? Array.from(value, (item) => serializeValue(item, state, depth + 1))
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, serializeValue(item, state, depth + 1)]),
        );
  } finally {
    state.ancestors.delete(value);
  }
}

/** Snapshot selected events as plain JSON without retaining producer-owned references. */
export function serializeDebugEvents(events: readonly DebugEventView[]): {
  events: DebugToolOutput["events"];
  dataNormalized: boolean;
} {
  const state: SerializationState = { normalized: false, ancestors: new WeakSet<object>() };
  const serialized = events.map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    level: event.level,
    category: event.category,
    message: event.message,
    ...(event.operationId === undefined ? {} : { operationId: event.operationId }),
    ...(event.cwd === undefined ? {} : { cwd: event.cwd }),
    ...(event.data === undefined ? {} : { data: serializeValue(event.data, state, 0) }),
    ...(event.rawData === undefined ? {} : { rawData: serializeValue(event.rawData, state, 0) }),
  }));
  return { events: serialized, dataNormalized: state.normalized };
}
