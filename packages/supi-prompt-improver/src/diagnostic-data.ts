import { redactDebugData } from "@mrclrchtr/supi-core/debug";

export const PROMPT_IMPROVER_DEBUG_LIMITS = {
  eventsPerRun: 16,
  depth: 8,
  arrayItems: 32,
  objectKeys: 64,
  stringCodePoints: 64_000,
  eventStringCodePoints: 72_000,
  nodes: 1_024,
  paths: 32,
  pathCodePoints: 300,
} as const;

const TRUNCATED = "[truncated]";
const OMIT = Symbol("omitted diagnostic value");
const ROOT_METADATA_NODE_RESERVE = PROMPT_IMPROVER_DEBUG_LIMITS.paths + 2;
const SOURCE_NODE_LIMIT = PROMPT_IMPROVER_DEBUG_LIMITS.nodes - ROOT_METADATA_NODE_RESERVE;

export interface BoundedDiagnosticData {
  value: unknown;
  truncated: boolean;
  paths: string[];
}

interface BoundState {
  remaining: number;
  nodes: number;
  nodeLimit: number;
  hasDiagnosticMetadata: boolean;
  truncated: boolean;
  paths: string[];
  seen: WeakSet<object>;
  sanitizeStrings: boolean;
}

const OBJECT_CAPTURE_KEYS = [
  "runId",
  "outcome",
  "reasonCode",
  "stage",
  "modelId",
  "durationMs",
  "outputLimit",
  "instructionsCodePoints",
  "payloadCodePoints",
  "counts",
  "guidanceFiles",
  "guidanceCodePoints",
  "conversationMessages",
  "conversationCodePoints",
  "summaryIncluded",
  "summaryCodePoints",
  "droppedGuidanceFiles",
  "droppedGuidanceCodePoints",
  "droppedConversationMessages",
  "droppedConversationCodePoints",
  "summaryDropped",
  "reduction",
  "request",
  "response",
  "systemPrompt",
  "messages",
  "role",
  "content",
  "type",
  "text",
  "thinking",
  "proposal",
  "questionnaire",
  "title",
  "intro",
  "questions",
  "header",
  "prompt",
  "id",
  "options",
  "value",
  "label",
  "description",
  "details",
  "multi",
  "recommendedIndexes",
  "recommendation",
  "placeholder",
  "questionCount",
  "originalDraft",
  "draft",
  "draftCodePoints",
  "background",
  "guidance",
  "path",
  "conversation",
  "sourceId",
  "summary",
  "source",
  "includedContext",
  "answers",
  "responses",
  "questionId",
  "questionComment",
  "answer",
  "kind",
  "answered",
  "selected",
  "comment",
  "error",
  "name",
  "message",
  "stack",
  "code",
  "status",
  "statusCode",
  "cause",
  "thrownValue",
  "thrownType",
  "timestamp",
  "endTurn",
  "api",
  "provider",
  "model",
  "responseModel",
  "stopReason",
  "rawStopReason",
  "errorMessage",
  "usage",
  "usageShape",
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "cacheWrite1h",
  "reasoning",
  "totalUsageUnits",
  "cost",
  "total",
  "contentShape",
  "namespace",
  "thoughtSignature",
  "arguments",
  "shape",
  "diagnosticTruncated",
  "diagnosticTruncatedPaths",
] as const;

/** Return JSON-safe data with explicit depth, shape, and string limits. */
export function boundDiagnosticData(
  value: unknown,
  options: { sanitizeStrings?: boolean } = {},
): BoundedDiagnosticData {
  const hasDiagnosticMetadata =
    valueShape(value) === "object" && readProperty(value, "diagnosticTruncated") === true;
  const state: BoundState = {
    remaining: PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    nodes: 0,
    nodeLimit: hasDiagnosticMetadata ? PROMPT_IMPROVER_DEBUG_LIMITS.nodes : SOURCE_NODE_LIMIT,
    hasDiagnosticMetadata,
    truncated: false,
    paths: [],
    seen: new WeakSet<object>(),
    sanitizeStrings: options.sanitizeStrings ?? false,
  };
  let bounded = visit(value, "$", 0, state);
  if (bounded === OMIT) bounded = undefined;
  if (state.truncated && isPlainRecord(bounded) && !state.hasDiagnosticMetadata) {
    bounded.diagnosticTruncated = true;
    const paths = captureDiagnosticPaths(state.paths, state);
    if (paths.length) bounded.diagnosticTruncatedPaths = paths;
  }
  return { value: bounded, truncated: state.truncated, paths: state.paths };
}

function visit(
  value: unknown,
  path: string,
  depth: number,
  state: BoundState,
): unknown | typeof OMIT {
  if (depth >= PROMPT_IMPROVER_DEBUG_LIMITS.depth || state.nodes >= state.nodeLimit) {
    state.truncated = true;
    addPath(state, path);
    return OMIT;
  }
  state.nodes += 1;
  if (value === null || typeof value !== "object") return visitPrimitive(value, path, state);
  const shape = valueShape(value);
  if (shape === "unreadable") return markTruncated(state, path, "[Unreadable object]");
  if (state.seen.has(value)) return markTruncated(state, path, "[Circular]");
  state.seen.add(value);
  return shape === "array"
    ? visitArray(value as unknown[], path, depth, state)
    : visitObject(value, path, depth, state);
}
function visitPrimitive(value: unknown, path: string, state: BoundState): unknown {
  if (typeof value === "string") return boundString(value, path, state);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : boundString(String(value), path, state);
  }
  if (typeof value === "bigint") return boundString(value.toString(), path, state);
  if (typeof value === "undefined") return boundString("[Undefined]", path, state);
  if (typeof value === "function" || typeof value === "symbol") {
    return boundString(`[${typeof value}]`, path, state);
  }
  return boundString(String(value), path, state);
}
function visitArray(value: unknown[], path: string, depth: number, state: BoundState): unknown[] {
  const length = safeArrayLength(value);
  const limit = PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems;
  const valueCount = Math.min(length, length > limit ? limit - 1 : limit);
  const result: unknown[] = [];
  let omitted = Math.max(0, length - valueCount);

  for (let index = 0; index < valueCount; index += 1) {
    let item: unknown;
    try {
      item = value[index];
    } catch {
      state.truncated = true;
      addPath(state, `${path}[${index}]`);
      item = "[Unreadable]";
    }
    const bounded = visit(item, `${path}[${index}]`, depth + 1, state);
    if (bounded === OMIT) omitted += 1;
    else result.push(bounded);
  }

  if (length > valueCount) {
    state.truncated = true;
    addPath(state, path);
  }
  if (omitted > 0 && depth + 1 < PROMPT_IMPROVER_DEBUG_LIMITS.depth) {
    const marker = appendGeneratedMarker(state, path, `[${omitted} items omitted]`);
    if (marker !== OMIT) result.push(marker);
  }
  return result;
}
function visitObject(
  value: object,
  path: string,
  depth: number,
  state: BoundState,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const rootMetadataReserve = depth === 0 ? 2 : 0;
  const maxCaptured = PROMPT_IMPROVER_DEBUG_LIMITS.objectKeys - rootMetadataReserve;
  let captured = 0;

  for (const rawKey of OBJECT_CAPTURE_KEYS) {
    const item = readProperty(value, rawKey);
    if (item === undefined) continue;
    const isRootMetadata =
      depth === 0 && state.hasDiagnosticMetadata && rawKey.startsWith("diagnosticTruncated");
    if (captured >= maxCaptured && !isRootMetadata) {
      state.truncated = true;
      addPath(state, path);
      if (depth === 0 && state.hasDiagnosticMetadata) continue;
      return result;
    }
    const bounded = visit(item, `${path}.${rawKey}`, depth + 1, state);
    if (bounded === OMIT) continue;
    result[rawKey] = bounded;
    captured += 1;
  }
  return result;
}
function boundString(value: string, path: string, state: BoundState): string {
  const source = state.sanitizeStrings ? sanitizeString(value) : value;
  const firstLimit = Math.min(PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints, state.remaining);
  const candidate = takeCodePoints(source, firstLimit);
  if (!candidate.truncated) {
    state.remaining = Math.max(0, state.remaining - countCodePoints(candidate.text));
    return candidate.text;
  }

  state.truncated = true;
  addPath(state, path);
  const limit = Math.min(PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints, state.remaining);
  const markerLength = countCodePoints(TRUNCATED);
  let result =
    limit >= markerLength
      ? `${takeCodePoints(source, limit - markerLength).text}${TRUNCATED}`
      : takeCodePoints(source, limit).text;
  if (state.sanitizeStrings) result = makeRedactionStable(result, limit);
  result = takeCodePoints(result, limit).text;
  state.remaining = Math.max(0, state.remaining - countCodePoints(result));
  return result;
}

function sanitizeString(value: string): string {
  return redactDebugData(value) as string;
}
function makeRedactionStable(value: string, limit: number): string {
  const sanitized = sanitizeString(value);
  if (countCodePoints(sanitized) <= limit) return sanitized;
  const originalPoints = Array.from(value);
  const sanitizedPoints = Array.from(sanitized);
  let commonLength = 0;
  while (
    commonLength < originalPoints.length &&
    originalPoints[commonLength] === sanitizedPoints[commonLength]
  ) {
    commonLength += 1;
  }
  const commonPrefix = originalPoints.slice(0, commonLength);
  let safeLength = -1;
  for (let index = 0; index < commonPrefix.length; index += 1) {
    if (/\s|[;&|?]/u.test(commonPrefix[index] ?? "")) safeLength = index + 1;
  }
  const marker = takeCodePoints(TRUNCATED, limit).text;
  const available = Math.max(0, limit - countCodePoints(marker));
  const prefix = safeLength > 0 ? commonPrefix.slice(0, safeLength).join("") : "";
  return `${takeCodePoints(prefix, available).text}${marker}`;
}

function markTruncated(state: BoundState, path: string, marker: string): string {
  state.truncated = true;
  addPath(state, path);
  const bounded = takeCodePoints(marker, state.remaining).text;
  state.remaining = Math.max(0, state.remaining - countCodePoints(bounded));
  return bounded;
}
function appendGeneratedMarker(
  state: BoundState,
  path: string,
  marker: string,
): string | typeof OMIT {
  if (state.nodes >= state.nodeLimit) return OMIT;
  state.nodes += 1;
  const bounded = takeCodePoints(marker, state.remaining).text;
  state.remaining = Math.max(0, state.remaining - countCodePoints(bounded));
  if (bounded.length !== marker.length) {
    state.truncated = true;
    addPath(state, path);
  }
  return bounded;
}
function addPath(state: BoundState, path: string): void {
  if (state.paths.length >= PROMPT_IMPROVER_DEBUG_LIMITS.paths || state.paths.includes(path))
    return;
  state.paths.push(takeCodePoints(path, PROMPT_IMPROVER_DEBUG_LIMITS.pathCodePoints).text);
}
function captureDiagnosticPaths(paths: string[], state: BoundState): string[] {
  const captured: string[] = [];
  for (const path of paths) {
    const limit = Math.min(PROMPT_IMPROVER_DEBUG_LIMITS.pathCodePoints, state.remaining);
    const bounded = takeCodePoints(path, limit).text;
    if (!bounded) break;
    captured.push(bounded);
    state.remaining = Math.max(0, state.remaining - countCodePoints(bounded));
  }
  return captured;
}

function takeCodePoints(value: string, limit: number): { text: string; truncated: boolean } {
  let text = "";
  let count = 0;
  for (const point of value) {
    if (count >= limit) return { text, truncated: true };
    text += point;
    count += 1;
  }
  return { text, truncated: false };
}

function safeArrayLength(value: unknown[]): number {
  try {
    return value.length;
  } catch {
    return 0;
  }
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "function")
    return undefined;
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function valueShape(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  try {
    return Array.isArray(value) ? "array" : "object";
  } catch {
    return "unreadable";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const countCodePoints = (value: string): number => Array.from(value).length;
