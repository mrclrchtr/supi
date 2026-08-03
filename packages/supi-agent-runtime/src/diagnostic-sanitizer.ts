import { redactDebugData } from "@mrclrchtr/supi-core/debug";

/** Maximum retained characters for one provider-owned diagnostic summary. */
export const MAX_AGENT_RUN_ERROR_CHARACTERS = 500;

const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const AUTH_HEADER_RE = /\b(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s;&|]+/gi;
const BEARER_TOKEN_RE = /\b(bearer\s+)[^\s;&|]+/gi;
const JSON_SECRET_RE =
  /(["']?(?:token|password|passwd|secret|api[_-]?key|authorization|credential)["']?\s*:\s*)(["'])[^"']*\2/gi;
const UNQUOTED_SECRET_RE =
  /(["']?(?:token|password|passwd|secret|api[_-]?key|authorization|credential)["']?\s*:\s*)(?!["'])[^\s,}\]]+/gi;

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159) ? " " : character;
  }).join("");
}

/** Redact, normalize, and bound provider-owned error text before retention. */
export function sanitizeAgentRunErrorText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const redacted = redactDebugData(
    value.replace(AUTH_HEADER_RE, (_match, prefix: string) => `${prefix}[REDACTED]`),
  )
    .replace(BEARER_TOKEN_RE, (_match, prefix: string) => `${prefix}[REDACTED]`)
    .replace(JSON_SECRET_RE, (_match, prefix: string, quote: string) => {
      return `${prefix}${quote}[REDACTED]${quote}`;
    })
    .replace(UNQUOTED_SECRET_RE, (_match, prefix: string) => `${prefix}[REDACTED]`);
  const normalized = stripControlCharacters(redacted.replace(ANSI_ESCAPE_RE, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  if (normalized.length <= MAX_AGENT_RUN_ERROR_CHARACTERS) return normalized;
  let end = MAX_AGENT_RUN_ERROR_CHARACTERS - 1;
  if (/[\uD800-\uDBFF]/.test(normalized[end - 1] ?? "")) end--;
  return `${normalized.slice(0, end)}…`;
}
