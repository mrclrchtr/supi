import {
  ERROR_STATES,
  eventStatus,
  eventType,
  isErrorStatus,
  isRecord,
  isSuccessStatus,
  isToolResultEvent,
  isToolStartEvent,
  SUCCESS_STATES,
  safeString,
  toolName,
} from "./event-values.ts";

/** Terminal results need explicit success; the absence of an error is not enough. */
export function hasExplicitSuccess(
  event: Record<string, unknown>,
  status: string | undefined,
): boolean {
  return status !== undefined
    ? isSuccessStatus(status)
    : event.is_error === false || event.isError === false || event.success === true;
}

/** Only explicit successful activity can establish observed evidence or complete a pending call. */
export function isSuccessfulActivity(event: Record<string, unknown>): boolean {
  const status = eventStatus(event);
  return (
    !isErrorStatus(status) &&
    isSuccessStatus(status) &&
    (status !== undefined || event.success === true || event.ok === true)
  );
}

/** Exclude planning/assistant steps even when their index matches a pending tool call. */
export function isNonToolStepUpdate(event: Record<string, unknown>): boolean {
  const type = eventType(event);
  if (!["assistant", "step_update"].includes(type)) return false;
  const declaredType = safeString(event.step_type ?? event.stepType, 40)?.toLowerCase();
  if (declaredType) return declaredType !== "tool";
  return toolName(event) === undefined && !isRecord(event.tool_info) && !isRecord(event.toolInfo);
}

/** Extract normalized tool activity from assistant content without treating answer text as evidence. */
export function nestedToolEvents(event: Record<string, unknown>): Record<string, unknown>[] {
  const content = isRecord(event.message) ? event.message.content : undefined;
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord).map(normalizeProtocolEvent).filter(isToolActivityBlock);
}

function isToolActivityBlock(event: Record<string, unknown>): boolean {
  return (
    isToolStartEvent(event) ||
    isToolResultEvent(event) ||
    (eventType(event) === "step_update" && !isNonToolStepUpdate(event))
  );
}

/** Adapt an agy event envelope to the small event vocabulary used by the reducer. */
export function normalizeProtocolEvent(event: Record<string, unknown>): Record<string, unknown> {
  const envelopeType = eventType(event);
  if (envelopeType === "result") return normalizeResultEnvelope(event);
  if (envelopeType === "step_update") return normalizeStepUpdateEnvelope(event);
  return event;
}

function normalizeResultEnvelope(event: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(event.result)) return { ...event, type: "result" };
  // Remove the envelope so its status fields cannot be mistaken for answer data.
  const { result, ...envelope } = event;
  return { ...envelope, ...result, type: "result" };
}

function normalizeStepUpdateEnvelope(event: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(event.step_update)) return event;
  const update = event.step_update;
  const stepType = lowerBoundedText(update.step_type ?? update.stepType);
  const toolShaped =
    update.tool_name !== undefined ||
    update.toolName !== undefined ||
    isRecord(update.tool_info) ||
    isRecord(update.toolInfo);
  if (stepType !== "tool" && !(stepType === "" && toolShaped)) {
    return { ...update, type: stepType === "agent_response" ? "assistant" : "step_update" };
  }
  return normalizeToolStep(update);
}

function normalizeToolStep(update: Record<string, unknown>): Record<string, unknown> {
  const state = lowerBoundedText(update.state);
  const toolInfo = getToolInfo(update);
  const parameters = toolInfo?.parameters ?? toolInfo?.input;
  const toolNameValue = update.tool_name ?? update.toolName ?? toolInfo?.name;
  const stepIndex = update.step_index ?? update.stepIndex;
  const active = state === "active" || state === "running";
  const terminal = SUCCESS_STATES.has(state) || ERROR_STATES.has(state);
  return {
    ...update,
    type: active ? "tool_use" : terminal ? "tool_result" : "step_update",
    ...(stepIndex === undefined ? {} : { id: stepIndex }),
    ...(toolNameValue === undefined ? {} : { tool_name: toolNameValue }),
    ...(isRecord(parameters) ? { input: parameters } : {}),
    ...(terminal ? toolStateFields(state, toolInfo) : {}),
  };
}

function getToolInfo(update: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(update.tool_info)) return update.tool_info;
  return isRecord(update.toolInfo) ? update.toolInfo : undefined;
}

function toolStateFields(
  state: string,
  toolInfo: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (SUCCESS_STATES.has(state)) return { status: "success" };
  return {
    status: "error",
    is_error: true,
    ...(toolInfo?.error === undefined ? {} : { error: toolInfo.error }),
  };
}

function lowerBoundedText(value: unknown): string {
  return (safeString(value, 40) ?? "").toLowerCase();
}
