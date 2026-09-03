import { ERROR_STATES, eventType, isRecord, SUCCESS_STATES, safeString } from "./event-values.ts";

/** Adapt an agy event envelope to the small event vocabulary used by the reducer. */
export function normalizeProtocolEvent(event: Record<string, unknown>): Record<string, unknown> {
  const envelopeType = eventType(event);
  if (envelopeType === "result") return normalizeResultEnvelope(event);
  if (envelopeType === "step_update") return normalizeStepUpdateEnvelope(event);
  return event;
}

function normalizeResultEnvelope(event: Record<string, unknown>): Record<string, unknown> {
  return isRecord(event.result)
    ? { ...event, ...event.result, type: "result" }
    : { ...event, type: "result" };
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
