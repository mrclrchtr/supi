// Shared debug event registry for SuPi extensions.
//
// Extensions record session-local diagnostic events here. The user-facing
// supi-debug extension owns policy/configuration and exposes events through a
// command/tool while this module stays dependency-free for producers.

export type DebugLevel = "debug" | "info" | "warning" | "error";
export type DebugAgentAccess = "off" | "sanitized" | "raw";

/** Custom session-entry type used to persist sanitized debug events. */
export const DEBUG_EVENT_ENTRY_TYPE = "supi-debug-event";
export interface DebugRegistryConfig {
  /** Whether producers should retain debug events. */
  enabled: boolean;
  /** What the agent-callable debug tool may return. */
  agentAccess: DebugAgentAccess;
  /** Whether Agent Run retrospective capture is explicitly enabled. */
  agentRunRetrospectivesEnabled: boolean;
  /**
   * Maximum number of session-local events to keep in memory. `debug` events
   * are evicted first; higher levels keep at most half of the buffer.
   */
  maxEvents: number;
  /**
   * Minimum level forwarded to persistence sinks. Lower-level events stay in the
   * live retained buffer only, so high-volume `debug` telemetry does not grow
   * session files.
   */
  persistLevel: DebugLevel;
}

export const DEBUG_REGISTRY_DEFAULTS: DebugRegistryConfig = {
  enabled: false,
  agentAccess: "sanitized",
  agentRunRetrospectivesEnabled: false,
  maxEvents: 100,
  persistLevel: "info",
};

const DEBUG_LEVEL_RANK: Record<DebugLevel, number> = { debug: 0, info: 1, warning: 2, error: 3 };

export interface DebugEventInput {
  /** Opaque identity for events directly owned by one public Tool call. */
  operationId?: string;
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
  /** Match one exact Debug Operation ID. */
  operationId?: string;
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
  operationId?: string;
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

/** Receives sanitized events for persistence; separate from ordinary event subscriptions. */
export type DebugPersistenceSink = (event: DebugEventView) => void;

export interface DebugSummary {
  total: number;
  byLevel: Partial<Record<DebugLevel, number>>;
  bySource: Record<string, number>;
}

interface DebugRegistryState {
  config: DebugRegistryConfig;
  events: DebugEvent[];
  listeners: Set<DebugEventListener>;
  persistenceSinks: Set<DebugPersistenceSink>;
  nextId: number;
}

const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-core/debug-registry");
const DEBUG_OPERATION_ID_RE = /^op-[A-Za-z0-9_-]{21}[AQgw]$/;
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
      persistenceSinks: new Set(),
      nextId: 1,
    };
    (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = state;
  }
  // Keep the shared registry compatible with extension reloads that reuse an
  // instance created before listener sets existed.
  if (!state.listeners) state.listeners = new Set();
  if (!state.persistenceSinks) state.persistenceSinks = new Set();
  return state;
}

function normalizeMaxEvents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEBUG_REGISTRY_DEFAULTS.maxEvents;
  }
  return Math.floor(value);
}

function isSummary(event: DebugEvent): boolean {
  return event.level !== "debug";
}

function groupKey(event: DebugEvent): string {
  return `${event.source}\u0000${event.category}`;
}

/**
 * Return the index of the oldest event in the largest source/category group of
 * one tier, so a high-volume category evicts its own events before rare ones.
 */
function evictionIndex(events: readonly DebugEvent[], summaryTier: boolean): number {
  const counts = new Map<string, number>();
  let largest = 0;
  for (const event of events) {
    if (isSummary(event) !== summaryTier) continue;
    const key = groupKey(event);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    largest = Math.max(largest, count);
  }
  return events.findIndex(
    (event) => isSummary(event) === summaryTier && counts.get(groupKey(event)) === largest,
  );
}

/**
 * Evict down to `maxEvents`. A `debug` event goes first, so high-volume
 * timings cannot push out a summary recorded moments earlier. Higher-level
 * events keep at most half the buffer; past that one of them goes instead, so
 * recent `debug` events stay visible too. Within the chosen tier, the oldest
 * event of the largest source/category group goes, so one flooding category
 * such as `request.timing` cannot push out every other category.
 */
function trimToMaxEvents(state: DebugRegistryState): void {
  const maxEvents = normalizeMaxEvents(state.config.maxEvents);
  const summaryShare = Math.floor(maxEvents / 2);
  let summaries = state.events.filter(isSummary).length;
  while (state.events.length > maxEvents) {
    const evictSummary = summaries > summaryShare;
    const index = evictionIndex(state.events, evictSummary);
    if (evictSummary) summaries--;
    state.events.splice(Math.max(index, 0), 1);
  }
}

/** Return whether a debug level is recognized by the registry. */
export function isDebugLevel(value: unknown): value is DebugLevel {
  return value === "debug" || value === "info" || value === "warning" || value === "error";
}

function shouldPersist(state: DebugRegistryState, level: DebugLevel): boolean {
  return DEBUG_LEVEL_RANK[level] >= DEBUG_LEVEL_RANK[state.config.persistLevel];
}

/** Return whether a value has the exact 16-byte base64url Debug Operation ID form. */
export function isDebugOperationId(value: unknown): value is string {
  return typeof value === "string" && DEBUG_OPERATION_ID_RE.test(value);
}

/** Match a debug event against the supported exact filters. */
export function matchesDebugEventQuery(
  event: Pick<DebugEventView, "operationId" | "source" | "level" | "category">,
  query: Pick<DebugEventQuery, "operationId" | "source" | "level" | "category">,
): boolean {
  if (query.operationId && event.operationId !== query.operationId) return false;
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
    persistLevel: isDebugLevel(config.persistLevel)
      ? config.persistLevel
      : state.config.persistLevel,
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

/**
 * Return whether an event at `level` would reach the session file now: Debug
 * must be enabled, at least one persistence sink must be registered, and the
 * persistence threshold must admit the level.
 */
export function canPersistDebugEvent(level: DebugLevel = "info"): boolean {
  const state = getState();
  return state.config.enabled && state.persistenceSinks.size > 0 && shouldPersist(state, level);
}

/**
 * Return whether a retrospective can be captured: an `info` event must be
 * persistable (see {@link canPersistDebugEvent}) and the explicit Agent Run
 * retrospective opt-in must be enabled.
 */
export function canRecordAgentRunRetrospective(): boolean {
  return getState().config.agentRunRetrospectivesEnabled && canPersistDebugEvent("info");
}

/** Best-effort redaction helper for data exposed through sanitized debug views. */
export function redactDebugData<T>(value: T): T {
  return redactValue(value, 8) as T;
}

function toSanitizedView(event: DebugEvent): DebugEventView {
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

/** Subscribe to sanitized events. Listeners are isolated so diagnostics cannot disrupt producers. */
export function subscribeDebugEvents(listener: DebugEventListener): () => void {
  const state = getState();
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/**
 * Register a sanitized event persistence sink. Sinks are tracked separately from
 * ordinary listeners so eligibility checks only succeed when logging is active.
 */
export function subscribeDebugPersistence(sink: DebugPersistenceSink): () => void {
  const state = getState();
  state.persistenceSinks.add(sink);
  return () => state.persistenceSinks.delete(sink);
}

/** Record a session-local debug event if debugging is enabled. */
export function recordDebugEvent(input: DebugEventInput): DebugEvent | null {
  const state = getState();
  if (input.operationId !== undefined && !isDebugOperationId(input.operationId)) {
    return null;
  }
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
  for (const listener of state.listeners) {
    try {
      listener(toSanitizedView(event));
    } catch {
      // Debug-event consumers must not alter producer behavior.
    }
  }
  const sinks = shouldPersist(state, event.level) ? state.persistenceSinks : [];
  for (const sink of sinks) {
    try {
      sink(toSanitizedView(event));
    } catch {
      // Persistence failures must not alter producer behavior.
    }
  }
  return {
    ...event,
    data: event.data === undefined ? undefined : redactDebugData(event.data),
  };
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
  state.persistenceSinks.clear();
  state.nextId = 1;
}
