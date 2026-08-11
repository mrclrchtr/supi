// Shared debug event registry for SuPi extensions.
//
// Extensions record session-local diagnostic events here. The user-facing
// supi-debug extension owns policy/configuration and exposes events through a
// command/tool while this module stays dependency-free for producers.

// biome-ignore lint/performance/noReExportAll: preserve the stable debug domain entry point
export * from "./debug-timing.ts";

export type DebugLevel = "debug" | "info" | "warning" | "error";
export type DebugAgentAccess = "off" | "sanitized" | "raw";
export interface DebugRegistryConfig {
  /** Whether producers should retain debug events. */
  enabled: boolean;
  /** What the agent-callable debug tool may return. */
  agentAccess: DebugAgentAccess;
  /** Maximum number of session-local events to keep in memory. */
  maxEvents: number;
}

export const DEBUG_REGISTRY_DEFAULTS: DebugRegistryConfig = {
  enabled: false,
  agentAccess: "sanitized",
  maxEvents: 100,
};

export interface DebugEventInput {
  source: string;
  level: DebugLevel;
  category: string;
  message: string;
  cwd?: string;
  data?: unknown;
  rawData?: unknown;
}

export interface DebugEvent extends DebugEventInput {
  id: number;
  timestamp: number;
  data?: unknown;
  rawData?: unknown;
}

export interface DebugEventQuery {
  source?: string;
  level?: DebugLevel;
  category?: string;
  limit?: number;
  includeRaw?: boolean;
  allowRaw?: boolean;
}

export interface DebugEventView {
  id: number;
  timestamp: number;
  source: string;
  level: DebugLevel;
  category: string;
  message: string;
  cwd?: string;
  data?: unknown;
  rawData?: unknown;
}

export interface DebugEventQueryResult {
  events: DebugEventView[];
  rawAccessDenied: boolean;
}

/** Receives a sanitized event whenever the registry records one. */
export type DebugEventListener = (event: DebugEventView) => void;

export interface DebugSummary {
  total: number;
  byLevel: Partial<Record<DebugLevel, number>>;
  bySource: Record<string, number>;
}

interface DebugRegistryState {
  config: DebugRegistryConfig;
  events: DebugEvent[];
  listeners: Set<DebugEventListener>;
  nextId: number;
}

const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-core/debug-registry");
const SECRET_KEY_RE = /(?:token|password|passwd|secret|api[_-]?key|authorization|credential)/i;
const ENV_SECRET_RE =
  /\b([A-Za-z0-9_]*(?:token|password|passwd|secret|api[_-]?key|authorization|credential)[A-Za-z0-9_]*)=(?:'[^']*'|"[^"]*"|\S+)/gi;
const AUTH_HEADER_RE = /\b(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s;&|]+/gi;
const URL_SECRET_RE =
  /([?&](?:token|password|passwd|secret|api[_-]?key|authorization|credential)=)[^&\s]+/gi;
const REDACTED = "[REDACTED]";

function cloneConfig(config: DebugRegistryConfig): DebugRegistryConfig {
  return { ...config };
}

function getState(): DebugRegistryState {
  let state = (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] as
    | DebugRegistryState
    | undefined;
  if (!state) {
    state = {
      config: cloneConfig(DEBUG_REGISTRY_DEFAULTS),
      events: [],
      listeners: new Set(),
      nextId: 1,
    };
    (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = state;
  }
  // Keep the shared registry compatible with extension reloads that reuse an
  // instance created before listeners existed.
  if (!state.listeners) state.listeners = new Set();
  return state;
}

function normalizeMaxEvents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEBUG_REGISTRY_DEFAULTS.maxEvents;
  }
  return Math.floor(value);
}

function trimToMaxEvents(state: DebugRegistryState): void {
  const maxEvents = normalizeMaxEvents(state.config.maxEvents);
  if (state.events.length <= maxEvents) {
    return;
  }
  state.events.splice(0, state.events.length - maxEvents);
}

/** Return whether a debug level is recognized by the registry. */
export function isDebugLevel(value: unknown): value is DebugLevel {
  return value === "debug" || value === "info" || value === "warning" || value === "error";
}

/** Match a debug event against the supported source, level, and category filters. */
export function matchesDebugEventQuery(
  event: Pick<DebugEventView, "source" | "level" | "category">,
  query: Pick<DebugEventQuery, "source" | "level" | "category">,
): boolean {
  if (query.source && event.source !== query.source) return false;
  if (query.level && event.level !== query.level) return false;
  if (query.category && event.category !== query.category) return false;
  return true;
}

function sanitizeString(value: string): string {
  return value
    .replace(ENV_SECRET_RE, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(AUTH_HEADER_RE, (_match, prefix: string) => `${prefix}${REDACTED}`)
    .replace(URL_SECRET_RE, (_match, prefix: string) => `${prefix}${REDACTED}`);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth <= 0) return "[MaxDepth]";
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth - 1));

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = SECRET_KEY_RE.test(key) ? REDACTED : redactValue(item, depth - 1);
  }
  return redacted;
}

/** Configure the shared debug registry. Existing events are trimmed to the new max size. */
export function configureDebugRegistry(config: Partial<DebugRegistryConfig>): DebugRegistryConfig {
  const state = getState();
  state.config = {
    ...state.config,
    ...config,
    maxEvents: normalizeMaxEvents(config.maxEvents ?? state.config.maxEvents),
  };
  trimToMaxEvents(state);
  return getDebugRegistryConfig();
}

/** Return the active debug registry configuration. */
export function getDebugRegistryConfig(): DebugRegistryConfig {
  return cloneConfig(getState().config);
}

/** Return whether the Debug Registry currently retains producer events. */
export function isDebugRegistryEnabled(): boolean {
  return getState().config.enabled;
}

/** Best-effort redaction helper for data exposed through sanitized debug views. */
export function redactDebugData<T>(value: T): T {
  return redactValue(value, 8) as T;
}

function toSanitizedView(event: DebugEvent): DebugEventView {
  return {
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    level: event.level,
    category: event.category,
    message: event.message,
    cwd: event.cwd,
    data: event.data,
  };
}

/** Subscribe to sanitized events. Listeners are isolated so diagnostics cannot disrupt producers. */
export function subscribeDebugEvents(listener: DebugEventListener): () => void {
  const state = getState();
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Record a session-local debug event if debugging is enabled. */
export function recordDebugEvent(input: DebugEventInput): DebugEvent | null {
  const state = getState();
  if (!state.config.enabled) {
    return null;
  }

  const event: DebugEvent = {
    ...input,
    id: state.nextId++,
    timestamp: Date.now(),
    data: input.data === undefined ? undefined : redactDebugData(input.data),
  };
  state.events.push(event);
  trimToMaxEvents(state);
  const view = toSanitizedView(event);
  for (const listener of state.listeners) {
    try {
      listener(view);
    } catch {
      // Debug-event consumers must not alter producer behavior.
    }
  }
  return { ...event };
}

/** Query retained debug events newest-first. Results are sanitized unless raw access is requested and allowed. */
export function getDebugEvents(query: DebugEventQuery = {}): DebugEventQueryResult {
  const state = getState();
  const allowRaw = Boolean(
    query.includeRaw && query.allowRaw && state.config.agentAccess === "raw",
  );
  const rawAccessDenied = Boolean(query.includeRaw && !allowRaw);
  const limit = query.limit && query.limit > 0 ? Math.floor(query.limit) : state.config.maxEvents;

  const events = state.events
    .filter((event) => matchesDebugEventQuery(event, query))
    .slice()
    .reverse()
    .slice(0, limit)
    .map((event): DebugEventView => {
      const view = toSanitizedView(event);
      if (allowRaw && event.rawData !== undefined) {
        view.rawData = event.rawData;
      }
      return view;
    });

  return { events, rawAccessDenied };
}

/** Return aggregate debug counts suitable for summary displays. */
export function getDebugSummary(): DebugSummary | null {
  const events = getState().events;
  if (events.length === 0) {
    return null;
  }

  const summary: DebugSummary = { total: events.length, byLevel: {}, bySource: {} };
  for (const event of events) {
    summary.byLevel[event.level] = (summary.byLevel[event.level] ?? 0) + 1;
    summary.bySource[event.source] = (summary.bySource[event.source] ?? 0) + 1;
  }
  return summary;
}

/** Clear retained events while preserving configuration. */
export function clearDebugEvents(): void {
  const state = getState();
  state.events = [];
}

/** Reset the debug registry to defaults; intended for tests. */
export function resetDebugRegistry(): void {
  const state = getState();
  state.config = cloneConfig(DEBUG_REGISTRY_DEFAULTS);
  state.events = [];
  state.listeners.clear();
  state.nextId = 1;
}
