/** Safe failure categories and warning text for suggestion generation. */

/** Safe categories used for model-request failures. */
export type SuggestionFailureKind =
  | "model-unavailable"
  | "authentication"
  | "billing"
  | "quota"
  | "rate-limit"
  | "timeout"
  | "request";

/** One safe failure value shared by the client, generator, and UI. */
export interface SuggestionFailure {
  kind: SuggestionFailureKind;
  /** Short, fixed classification. It never contains provider response text. */
  summary: string;
  /** Validated provider HTTP status, when one was available. */
  httpStatus?: number;
}

/** Runtime categories that can result from a dispatched model request. */
export type RuntimeSuggestionFailureKind = Exclude<SuggestionFailureKind, "model-unavailable">;

/** A runtime failure with a category that requires a dispatched request. */
export type RuntimeSuggestionFailure = SuggestionFailure & {
  kind: RuntimeSuggestionFailureKind;
};

/** Structured safe warning passed from generation to the session UI. */
export interface SuggestionWarning extends SuggestionFailure {
  /** Bounded provider/model identifier safe for the notification surface. */
  model: string;
}

const FAILURE_SUMMARIES: Record<SuggestionFailureKind, string> = {
  "model-unavailable": "selected model is unavailable",
  authentication: "authentication failed",
  billing: "billing failed",
  quota: "quota exceeded",
  "rate-limit": "rate limit exceeded",
  timeout: "request timed out",
  request: "provider request failed",
};

const MAX_MODEL_LABEL_LENGTH = 96;
const SAFE_MODEL_CHARACTERS = /[^a-zA-Z0-9._:+@/-]/g;
const AUTHENTICATION_ERROR =
  /\b(?:auth(?:entication)?|api[\s_-]*key|invalid[\s_-]+api[\s_-]*key|credential|oauth|unauthori[sz]ed|forbidden|provider[\s_-]+is[\s_-]+not[\s_-]+configured)\b/i;
const TIMEOUT_ERROR = /\b(?:abort(?:ed|ing)?|deadline|tim(?:e|ed) out|timeout)\b/i;
const BILLING_EVIDENCE =
  /\b(?:billing(?:error)?|payment|subscription|insufficient[\s_-]*funds|payment[\s_-]*(?:required|failed|error))\b/i;
const QUOTA_EVIDENCE =
  /\b(?:insufficient[\s_-]*quota|quota|(?:go|free)[\s_-]*usage[\s_-]*limit[\s_-]*error|usage[\s_-]*(?:limit|quota|not[\s_-]*included)|(?:monthly|weekly|daily)[\s_-]*usage[\s_-]*limit|available[\s_-]*balance|out[\s_-]*of[\s_-]*budget|credits?[\s_-]*(?:exhausted|depleted|exceeded))\b/i;
const RATE_LIMIT_EVIDENCE =
  /\b(?:rate[\s_-]*limit(?:[\s_-]*exceeded)?|too[\s_-]*many[\s_-]*requests|throttl\w*|request[\s_-]*limit)\b/i;
const TIMEOUT_CODE = /\b(?:ETIMEDOUT|ECONNABORTED|TIMEOUT)\b/i;
const LEADING_HTTP_STATUS = /^\s*(?:error\s*[:=-]\s*)?\(?([45]\d{2})(?=$|[\s.,:;()[\]{}'">])/i;
const LABELED_HTTP_STATUS =
  /(?<![A-Za-z0-9_/?#&.@=-])(?:http(?:\/\d+(?:\.\d+)?)?(?:\s*(?:status|code))?|status(?:\s*code)?)\s*(?:is\s*)?(?:[:=]\s*|\(\s*|\s+)([45]\d{2})(?=$|[\s.,:;()[\]{}'">])/i;
const ERROR_PARENTHESIZED_STATUS =
  /(?<![A-Za-z0-9_/?#&.@=-])(?:error|failure|failed)\b[^\r\n()]{0,80}\(\s*([45]\d{2})\s*\)(?=$|[\s.,:;()[\]{}'">])/i;
const JSON_STATUS_FIELD =
  /["'](?:status|statusCode|httpStatus|http_status)["']\s*:\s*["']?([45]\d{2})(?=$|[\s,"'}])/i;
const CODE_FIELD = /["'](?:code|type|category|error_type)["']\s*:\s*["']([^"'\\]{1,128})["']/gi;
const PROVIDER_CODE_KEYS = new Set(["code", "type", "category", "error_type"]);

/** Return the fixed summary for one failure category. */
export function suggestionFailureSummary(kind: SuggestionFailureKind): string {
  return FAILURE_SUMMARIES[kind];
}

/** Build one safe failure value from a category and an optional HTTP status. */
export function createSuggestionFailure(
  kind: SuggestionFailureKind,
  httpStatus?: number,
): SuggestionFailure {
  const validStatus = validateHttpStatus(httpStatus);
  return {
    kind,
    summary: suggestionFailureSummary(kind),
    ...(validStatus === undefined ? {} : { httpStatus: validStatus }),
  };
}

/** Build a bounded warning without copying provider or credential data. */
export function createSuggestionWarning(
  modelId: string,
  failure: SuggestionFailure,
): SuggestionWarning;
export function createSuggestionWarning(
  modelId: string,
  kind: SuggestionFailureKind,
  httpStatus?: number,
): SuggestionWarning;
export function createSuggestionWarning(
  modelId: string,
  failureOrKind: SuggestionFailure | SuggestionFailureKind,
  httpStatus?: number,
): SuggestionWarning {
  const failure =
    typeof failureOrKind === "string"
      ? createSuggestionFailure(failureOrKind, httpStatus)
      : createSuggestionFailure(failureOrKind.kind, failureOrKind.httpStatus);
  return { model: safeModelLabel(modelId), ...failure };
}

/**
 * Classify a runtime request failure without returning its provider message.
 * The input is used only for local matching against safe broad categories.
 */
export function classifySuggestionFailure(error: unknown): RuntimeSuggestionFailure {
  const evidence = collectFailureEvidence(error);
  const explicitKind = classifyExplicitEvidence(evidence);
  if (explicitKind) return createRuntimeFailure(explicitKind, evidence.httpStatus);

  const text = normalizeEvidence(evidence.text);
  const codeText = normalizeEvidence(evidence.codeText);
  if (
    AUTHENTICATION_ERROR.test(text) ||
    evidence.httpStatus === 401 ||
    evidence.httpStatus === 403
  ) {
    return createRuntimeFailure("authentication", evidence.httpStatus);
  }
  if (TIMEOUT_CODE.test(codeText) || TIMEOUT_ERROR.test(text)) {
    return createRuntimeFailure("timeout", evidence.httpStatus);
  }
  if (evidence.httpStatus === 429) return createRuntimeFailure("rate-limit", evidence.httpStatus);
  return createRuntimeFailure("request", evidence.httpStatus);
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
  const status = validateHttpStatus(warning.httpStatus);
  const statusText = status === undefined ? "" : ` (HTTP ${status})`;
  return `Prompt suggestion unavailable for ${warning.model}: ${suggestionFailureSummary(warning.kind)}${statusText}`;
}

function classifyExplicitEvidence(
  evidence: FailureEvidence,
): RuntimeSuggestionFailureKind | undefined {
  return (
    classifyServiceEvidence(normalizeEvidence(evidence.codeText)) ??
    classifyServiceEvidence(normalizeEvidence(evidence.text))
  );
}

/** Specific quota limits take precedence over generic billing text in both tiers. */
function classifyServiceEvidence(text: string): RuntimeSuggestionFailureKind | undefined {
  if (QUOTA_EVIDENCE.test(text)) return "quota";
  if (BILLING_EVIDENCE.test(text)) return "billing";
  if (RATE_LIMIT_EVIDENCE.test(text)) return "rate-limit";
  return undefined;
}

function normalizeEvidence(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function createRuntimeFailure(
  kind: RuntimeSuggestionFailureKind,
  httpStatus?: number,
): RuntimeSuggestionFailure {
  return createSuggestionFailure(kind, httpStatus) as RuntimeSuggestionFailure;
}

interface FailureEvidence {
  text: string;
  codeText: string;
  httpStatus?: number;
}

function collectFailureEvidence(error: unknown): FailureEvidence {
  if (typeof error === "string") {
    const codes = extractProviderCodes(error);
    return {
      text: [error, ...codes].join("\n"),
      codeText: codes.join("\n"),
      httpStatus: extractHttpStatus(error),
    };
  }

  if (!isRecord(error)) return { text: "", codeText: "" };

  const messages = [readString(error, "message"), readString(error, "errorMessage")].filter(
    (value): value is string => value !== undefined,
  );
  const directCodes = Array.from(PROVIDER_CODE_KEYS, (key) => readString(error, key)).filter(
    (value): value is string => value !== undefined,
  );
  const nestedCodes = messages.flatMap(extractProviderCodes);
  const codes = [...directCodes, ...nestedCodes];
  const httpStatus =
    firstHttpStatus(error.status, error.statusCode, error.httpStatus, error.http_status) ??
    messages.map(extractHttpStatus).find((value): value is number => value !== undefined);

  return {
    text: [...messages, ...codes].join("\n"),
    codeText: codes.join("\n"),
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

function extractHttpStatus(message: string): number | undefined {
  const candidates = [
    message.match(LEADING_HTTP_STATUS)?.[1],
    message.match(LABELED_HTTP_STATUS)?.[1],
    message.match(ERROR_PARENTHESIZED_STATUS)?.[1],
    message.match(JSON_STATUS_FIELD)?.[1],
  ];
  return candidates
    .map((candidate) => validateHttpStatus(candidate))
    .find((value): value is number => value !== undefined);
}

function firstHttpStatus(...values: unknown[]): number | undefined {
  return values.map(validateHttpStatus).find((value): value is number => value !== undefined);
}

function validateHttpStatus(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 400 && value <= 599 ? value : undefined;
  }
  if (typeof value === "string" && /^[45]\d{2}$/.test(value)) return Number(value);
  return undefined;
}

function extractProviderCodes(message: string): string[] {
  const codes: string[] = [];
  const jsonStart = message.indexOf("{");
  if (jsonStart !== -1) {
    try {
      collectProviderCodes(JSON.parse(message.slice(jsonStart)), codes);
    } catch {
      // The broad evidence patterns below still classify a truncated body safely.
    }
  }
  if (codes.length > 0) return codes;
  for (const match of message.matchAll(CODE_FIELD)) {
    const code = match[1];
    if (code) codes.push(code);
  }
  return codes;
}

function collectProviderCodes(value: unknown, codes: string[], depth = 0): void {
  if (!isRecord(value) || depth > 3) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (PROVIDER_CODE_KEYS.has(normalizedKey) && typeof nested === "string") codes.push(nested);
    if (normalizedKey === "error" || normalizedKey === "details") {
      collectProviderCodes(nested, codes, depth + 1);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function safeModelPart(value: string): string {
  return value.replace(SAFE_MODEL_CHARACTERS, "_").replace(/_+/g, "_");
}
