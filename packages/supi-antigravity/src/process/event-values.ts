import { createHash } from "node:crypto";

const MAX_SAFE_TEXT = 64 * 1024;
const MAX_TOOL_NAME = 80;
const MAX_ID_LENGTH = 512;

export const SUCCESS_STATES: ReadonlySet<string> = new Set([
  "success",
  "succeeded",
  "done",
  "completed",
  "complete",
  "ok",
]);
export const ERROR_STATES: ReadonlySet<string> = new Set([
  "error",
  "failed",
  "failure",
  "aborted",
  "cancelled",
  "canceled",
  "timeout",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeString(value: unknown, maxLength = MAX_SAFE_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}

export function eventType(event: Record<string, unknown>): string {
  return (safeString(event.type, 40) ?? safeString(event.event, 40) ?? "").toLowerCase();
}

export function eventStatus(event: Record<string, unknown>): string | undefined {
  if (
    event.is_error === true ||
    event.isError === true ||
    (event.error !== undefined && event.error !== null)
  ) {
    return "error";
  }
  const direct = safeString(event.status, 40) ?? safeString(event.subtype, 40);
  if (direct) return direct.toLowerCase();
  if (event.ok === true || event.success === true) return "success";
  return undefined;
}

export function isSuccessStatus(status: string | undefined): boolean {
  return status === undefined || SUCCESS_STATES.has(status);
}

export function isErrorStatus(status: string | undefined): boolean {
  return status !== undefined && ERROR_STATES.has(status);
}

export function eventId(event: Record<string, unknown>): string | undefined {
  const sources = [
    event,
    isRecord(event.tool_call) ? event.tool_call : undefined,
    isRecord(event.toolCall) ? event.toolCall : undefined,
    isRecord(event.tool_use) ? event.tool_use : undefined,
    isRecord(event.toolUse) ? event.toolUse : undefined,
  ];
  for (const source of sources) {
    if (!source) continue;
    for (const key of [
      "tool_use_id",
      "toolUseId",
      "tool_call_id",
      "toolCallId",
      "step_index",
      "stepIndex",
      "id",
    ]) {
      const value = safeIdentifier(source[key]);
      if (value) return value;
    }
  }
  return undefined;
}

export function conversationId(event: Record<string, unknown>): string | undefined {
  for (const key of ["session_id", "sessionId", "conversation_id", "conversationId"]) {
    const value = safeString(event[key], MAX_ID_LENGTH);
    if (value) return value;
  }
  for (const nested of [event.session, event.conversation]) {
    if (!isRecord(nested)) continue;
    const value = conversationId(nested);
    if (value) return value;
  }
  return undefined;
}

export function toolName(event: Record<string, unknown>): string | undefined {
  const sources = [
    event,
    isRecord(event.tool) ? event.tool : undefined,
    isRecord(event.tool_call) ? event.tool_call : undefined,
    isRecord(event.toolCall) ? event.toolCall : undefined,
    isRecord(event.tool_use) ? event.tool_use : undefined,
    isRecord(event.toolUse) ? event.toolUse : undefined,
    isRecord(event.step_update) ? event.step_update : undefined,
  ];
  for (const source of sources) {
    const name = source ? nameFromSource(source) : undefined;
    if (name) return name;
  }
  return undefined;
}

function nameFromSource(source: Record<string, unknown>): string | undefined {
  for (const key of ["tool_name", "toolName", "name"]) {
    const value = safeString(source[key], MAX_TOOL_NAME);
    if (value) return normalizeToolName(value);
  }
  const functionValue = isRecord(source.function)
    ? safeString(source.function.name, MAX_TOOL_NAME)
    : undefined;
  return functionValue ? normalizeToolName(functionValue) : undefined;
}

export function normalizeToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-\s]+/g, "_")
    .slice(0, MAX_TOOL_NAME);
}

function safeIdentifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return safeString(value, MAX_ID_LENGTH);
}

export function toolInput(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const nested = [
    event.tool_call,
    event.toolCall,
    event.tool_use,
    event.toolUse,
    event.tool,
    event.input,
    event.arguments,
    event.tool_info,
    event.toolInfo,
  ];
  for (const value of nested) {
    const input = inputFromValue(value);
    if (input) return input;
  }
  return undefined;
}

function inputFromValue(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.input)) return value.input;
  if (isRecord(value.arguments)) return value.arguments;
  if (isRecord(value.args)) return value.args;
  if (isRecord(value.parameters)) return value.parameters;
  return value;
}

export function extractUrl(value: unknown): string | undefined {
  return readBoundedField(value, ["url", "uri", "link"], (candidate) =>
    /^https?:\/\//i.test(candidate),
  );
}

export function extractWorkspacePath(value: unknown): string | undefined {
  return readBoundedField(value, [
    "path",
    "file",
    "file_path",
    "relative_path",
    "directory_path",
    "search_path",
    "search_directory",
    "absolute_path",
    "directory",
  ]);
}

function readBoundedField(
  value: unknown,
  names: readonly string[],
  predicate: (candidate: string) => boolean = () => true,
): string | undefined {
  if (!isRecord(value)) return undefined;
  const fields = Object.entries(value);
  for (const name of names) {
    const normalizedName = normalizeFieldName(name);
    for (const [key, field] of fields) {
      if (normalizeFieldName(key) !== normalizedName) continue;
      const candidate = safeString(field, 4_096);
      if (candidate && predicate(candidate)) return candidate;
    }
  }
  return undefined;
}

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[-_]/g, "");
}

export function hashEvidence(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function answerCandidate(
  event: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const candidates = [
    event.structured_output,
    event.structuredOutput,
    event.output,
    event.result,
    event.response,
    event.data,
  ];
  for (const value of candidates) {
    const candidate = decodeCandidate(value);
    if (candidate) return selectAnswerFields(candidate);
  }
  return hasAnswerFields(event) ? selectAnswerFields(event) : undefined;
}

function decodeCandidate(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  const text = safeString(value, MAX_SAFE_TEXT);
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function hasAnswerFields(value: Record<string, unknown>): boolean {
  return "answer" in value && "sources" in value && "workspaceEvidence" in value;
}

function selectAnswerFields(value: Record<string, unknown>): Record<string, unknown> {
  return {
    answer: value.answer,
    sources: value.sources,
    workspaceEvidence: value.workspaceEvidence,
  };
}

export function isTerminalEvent(event: Record<string, unknown>): boolean {
  const type = eventType(event);
  return (
    ["result", "terminal", "done", "final", "completion", "response"].includes(type) ||
    event.final === true
  );
}

export function isToolResultEvent(event: Record<string, unknown>): boolean {
  const type = eventType(event);
  return (
    type === "tool_result" ||
    type === "toolresult" ||
    type === "toolresponse" ||
    type === "tool_response"
  );
}

export function isToolStartEvent(event: Record<string, unknown>): boolean {
  const type = eventType(event);
  return type === "tool_use" || type === "tooluse" || type === "tool_call" || type === "toolcall";
}
