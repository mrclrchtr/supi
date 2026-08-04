import { redactDebugData } from "@mrclrchtr/supi-core/debug";

/** Maximum retained characters for one provider-owned diagnostic summary. */
export const MAX_AGENT_RUN_ERROR_CHARACTERS = 500;

const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const AUTH_HEADER_RE = /\b(authorization\s*[:=]\s*)[^\r\n]*/gi;
const BEARER_TOKEN_RE = /\b(bearer\s+)[^\s;&|]+/gi;
const JSON_DOUBLE_SECRET_RE =
  /((?:\\?["']?)(?:token|password|passwd|secret|api[_-]?key|authorization|credential)(?:\\?["']?\s*:\s*))\\?"(?:\\.|[^"\\])*\\?"/gi;
const JSON_SINGLE_SECRET_RE =
  /((?:\\?["']?)(?:token|password|passwd|secret|api[_-]?key|authorization|credential)(?:\\?["']?\s*:\s*))\\?'(?:\\.|[^'\\])*\\?'/gi;
const UNQUOTED_SECRET_RE =
  /(["']?(?:token|password|passwd|secret|api[_-]?key|authorization|credential)["']?\s*:\s*)(?!["'])[^\s,}\]]+/gi;
const LABEL_SECRET_RE =
  /(\b(?:api[\s_-]?key|token|password|passwd|secret|authorization|credential)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s;&|]+)/gi;
const PHRASED_LABEL_SECRET_RE =
  /(\b(?:api[\s_-]?key|token|password|passwd|secret|authorization|credential)\b[^\r\n]{0,80}?[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s;&|]+)/gi;
const SAFE_PROVIDER_ERROR_CATEGORIES = [
  {
    label: "authentication",
    pattern: /\b(?:authenticat\w*|unauthoriz\w*|forbidden|permission|credential)\b/i,
  },
  { label: "rate-limit", pattern: /\b(?:rate[ -]?limit|quota|billing|429)\b/i },
  { label: "timeout", pattern: /\b(?:timed?[- ]?out|timeout|deadline)\b/i },
  { label: "aborted", pattern: /\b(?:abort\w*|cancel\w*)\b/i },
  { label: "context-limit", pattern: /\b(?:context|token limit|too many tokens)\b/i },
  { label: "network", pattern: /\b(?:network|socket|connection|fetch|dns|websocket)\b/i },
  { label: "invalid-request", pattern: /\b(?:invalid|malformed|bad request|400|422)\b/i },
  { label: "provider-unavailable", pattern: /\b(?:overload\w*|server error|50[235]|529)\b/i },
] as const;
const PROVIDER_STATUS_RE = /\b(?:http(?:\s+status)?|status|code)\s*[:=]?\s*(\d{3})\b/i;

function summarizeProviderError(value: string): string {
  const categories = SAFE_PROVIDER_ERROR_CATEGORIES.filter(({ pattern }) =>
    pattern.test(value),
  ).map(({ label }) => label);
  const status = value.match(PROVIDER_STATUS_RE)?.[1];
  const summary = status
    ? `provider status ${status} error`
    : categories.length > 0
      ? `provider ${categories.join("/")} error`
      : "provider error";
  return value.includes("[REDACTED]") ? `${summary} [REDACTED]` : summary;
}

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  }).join("");
}

/** Redact, normalize, and bound provider-owned error text before retention. */
export function sanitizeAgentRunErrorText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalizedInput = stripControlCharacters(value.replace(ANSI_ESCAPE_RE, ""));
  const redacted = redactDebugData(
    normalizedInput.replace(AUTH_HEADER_RE, (_match, prefix: string) => `${prefix}[REDACTED]`),
  )
    .replace(BEARER_TOKEN_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(JSON_DOUBLE_SECRET_RE, (_match, prefix: string) => `${prefix}"[REDACTED]"`)
    .replace(JSON_SINGLE_SECRET_RE, (_match, prefix: string) => `${prefix}'[REDACTED]'`)
    .replace(UNQUOTED_SECRET_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(LABEL_SECRET_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(PHRASED_LABEL_SECRET_RE, (_match, prefix: string) => `${prefix}[REDACTED]`);
  const normalized = stripControlCharacters(redacted.replace(ANSI_ESCAPE_RE, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  return summarizeProviderError(normalized);
}
