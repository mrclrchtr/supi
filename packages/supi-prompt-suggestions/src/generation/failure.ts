/** Safe failure categories and warning text for suggestion generation. */

/** Safe categories used for model-request failures. */
export type SuggestionFailureKind = "model-unavailable" | "authentication" | "timeout" | "request";

/** Structured safe warning passed from generation to the session UI. */
export interface SuggestionWarning {
  /** Bounded provider/model identifier safe for the notification surface. */
  model: string;
  kind: SuggestionFailureKind;
  /** Short, fixed classification. It must not contain provider response text. */
  summary: string;
}

/** Runtime categories that can result from a dispatched model request. */
export type RuntimeSuggestionFailureKind = Exclude<SuggestionFailureKind, "model-unavailable">;

const FAILURE_SUMMARIES: Record<SuggestionFailureKind, string> = {
  "model-unavailable": "selected model is unavailable",
  authentication: "authentication is not configured",
  timeout: "request timed out",
  request: "provider request failed",
};

const MAX_MODEL_LABEL_LENGTH = 96;
const SAFE_MODEL_CHARACTERS = /[^a-zA-Z0-9._:+@/-]/g;
const AUTHENTICATION_ERROR =
  /\b(api[- ]?key|authentication|credential|oauth|unauthori[sz]ed|forbidden|provider is not configured)\b/i;
const AUTHENTICATION_STATUS = /\b(?:status|http)?\s*[:=]?\s*(?:401|403)\b/i;
const TIMEOUT_ERROR = /\b(abort(?:ed|ing)?|deadline|tim(?:e|ed) out|timeout)\b/i;

/** Return the fixed summary for one failure category. */
export function suggestionFailureSummary(kind: SuggestionFailureKind): string {
  return FAILURE_SUMMARIES[kind];
}

/** Build a bounded warning without copying provider or credential data. */
export function createSuggestionWarning(
  modelId: string,
  kind: SuggestionFailureKind,
): SuggestionWarning {
  return {
    model: safeModelLabel(modelId),
    kind,
    summary: suggestionFailureSummary(kind),
  };
}

/**
 * Classify a runtime request failure without returning its provider message.
 * The input is used only for local matching against safe broad categories.
 */
export function classifySuggestionFailure(error: unknown): RuntimeSuggestionFailureKind {
  if (
    hasFailureCode(error, "auth") ||
    hasFailureCode(error, "oauth") ||
    hasFailureStatus(error, 401) ||
    hasFailureStatus(error, 403)
  ) {
    return "authentication";
  }
  if (
    hasFailureCode(error, "ETIMEDOUT") ||
    hasFailureCode(error, "ECONNABORTED") ||
    hasFailureCode(error, "TIMEOUT")
  ) {
    return "timeout";
  }

  const message = getFailureMessage(error);
  if (AUTHENTICATION_ERROR.test(message) || AUTHENTICATION_STATUS.test(message)) {
    return "authentication";
  }
  if (TIMEOUT_ERROR.test(message)) return "timeout";
  return "request";
}

/** Convert a configured canonical id to a short, printable provider/model label. */
export function safeModelLabel(modelId: string): string {
  const separator = modelId.indexOf("/");
  const provider = separator === -1 ? modelId : modelId.slice(0, separator);
  const model = separator === -1 ? "unknown-model" : modelId.slice(separator + 1);
  const safeProvider = safeModelPart(provider) || "unknown-provider";
  const safeModel = safeModelPart(model) || "unknown-model";
  return `${safeProvider}/${safeModel}`.slice(0, MAX_MODEL_LABEL_LENGTH);
}

/** Format a warning whose model label was bounded by createSuggestionWarning. */
export function formatSuggestionWarning(warning: SuggestionWarning): string {
  return `Prompt suggestion unavailable for ${warning.model}: ${suggestionFailureSummary(warning.kind)}`;
}

function safeModelPart(value: string): string {
  return value.replace(SAFE_MODEL_CHARACTERS, "_").replace(/_+/g, "_");
}

function hasFailureCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === code;
}

function hasFailureStatus(error: unknown, status: number): boolean {
  if (!error || typeof error !== "object") return false;
  const value = (error as { status?: unknown; statusCode?: unknown }).status;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return value === status || statusCode === status;
}

function getFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}
