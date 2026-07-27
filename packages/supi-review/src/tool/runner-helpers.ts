/** Shared child-session helpers that do not retain model-generated diagnostics. */

/** Extract visible text from a message content value (string or content-part array). */
export function extractVisibleText(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const texts = content
    .map((part) => {
      if (typeof part !== "object" || !part) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter((value) => value.length > 0);

  return texts.length > 0 ? texts.join("\n") : undefined;
}

/** Build a truncated string representation of session stats for progress. */
export function buildProgressTokens(
  getSessionStats: () => {
    tokens?: {
      input?: number;
      output?: number;
      total?: number;
      cacheRead?: number;
      cacheWrite?: number;
    };
  },
):
  | { input: number; output: number; total: number; cacheRead?: number; cacheWrite?: number }
  | undefined {
  try {
    const stats = getSessionStats();
    return stats?.tokens
      ? {
          input: stats.tokens.input ?? 0,
          output: stats.tokens.output ?? 0,
          total: stats.tokens.total ?? 0,
          cacheRead: stats.tokens.cacheRead,
          cacheWrite: stats.tokens.cacheWrite,
        }
      : undefined;
  } catch {
    return undefined;
  }
}
