/**
 * Prompt suggestion normalization.
 *
 * Trims, strips matching outer quotes, detects the NO_SUGGESTION sentinel,
 * collapses whitespace, rejects empty results, and applies a high grapheme-safe
 * safety cap to guard against runaway model output.
 *
 * @module
 */

const MAX_SUGGESTION_GRAPHEMES = 2_000;

/** Sentinels that indicate the model found no useful suggestion. */
const NO_SUGGESTION_SENTINELS = ["NO_SUGGESTION", "NO SUGGESTION"];

export interface NormalizedSuggestion {
  /** Full normalized suggestion text, possibly safety-capped. */
  text: string;
  /** Whether the high safety cap was applied. */
  wasSafetyCapped: boolean;
  /** Grapheme count after normalization and before safety capping. */
  originalGraphemeCount: number;
  /** Grapheme count of the returned text. */
  graphemeCount: number;
}

/**
 * Normalize a raw suggestion string and return metadata about safety capping.
 * Exported for orchestration and testing.
 */
export function normalizeSuggestionDetailed(text: string): NormalizedSuggestion | null {
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

  // Collapse all whitespace to spaces.
  normalized = normalized.replace(/\s+/g, " ").trim();

  if (!normalized) return null;

  const graphemes = splitGraphemes(normalized);
  const wasSafetyCapped = graphemes.length > MAX_SUGGESTION_GRAPHEMES;
  if (!wasSafetyCapped) {
    return {
      text: normalized,
      wasSafetyCapped: false,
      originalGraphemeCount: graphemes.length,
      graphemeCount: graphemes.length,
    };
  }

  const cappedText = graphemes.slice(0, MAX_SUGGESTION_GRAPHEMES).join("").trimEnd();
  const cappedGraphemeCount = splitGraphemes(cappedText).length;
  return {
    text: cappedText,
    wasSafetyCapped: true,
    originalGraphemeCount: graphemes.length,
    graphemeCount: cappedGraphemeCount,
  };
}

/**
 * Normalize a raw suggestion string: trim, strip outer quotes, detect
 * NO_SUGGESTION, collapse whitespace, reject empty, and apply the high safety
 * cap. Exported for existing callers and tests that only need the text.
 */
export function normalizeSuggestion(text: string): string | null {
  return normalizeSuggestionDetailed(text)?.text ?? null;
}

function splitGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (segment) => segment.segment);
}
