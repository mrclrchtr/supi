/**
 * Prompt suggestion normalization.
 *
 * Trims, strips matching outer quotes, detects the NO_SUGGESTION sentinel,
 * collapses whitespace, rejects empty results, truncates at 240 chars.
 *
 * @module
 */

const MAX_SUGGESTION_LENGTH = 240;

/** Sentinels that indicate the model found no useful suggestion. */
const NO_SUGGESTION_SENTINELS = ["NO_SUGGESTION", "NO SUGGESTION"];

/**
 * Normalize a raw suggestion string: trim, strip outer quotes,
 * detect NO_SUGGESTION sentinel, collapse whitespace, reject empty,
 * truncate at 240 chars.
 * Exported for testing.
 */
export function normalizeSuggestion(text: string): string | null {
  let normalized = text.trim();

  // Strip matching outer quotes
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Detect NO_SUGGESTION sentinel (case-insensitive, after quote stripping)
  const upper = normalized.toUpperCase();
  if (NO_SUGGESTION_SENTINELS.some((s) => upper === s || upper.startsWith(s))) {
    return null;
  }

  // Collapse internal newlines to spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  // Reject empty (also catches pure-sentinel after whitespace collapse)
  if (!normalized) return null;

  // Truncate overlong suggestions
  if (normalized.length > MAX_SUGGESTION_LENGTH) {
    normalized = normalized.slice(0, MAX_SUGGESTION_LENGTH);
  }

  return normalized;
}
