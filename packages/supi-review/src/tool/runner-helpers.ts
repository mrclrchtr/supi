/**
 * Shared helpers for child-session runners (brief synthesis & review).
 *
 * These were extracted from brief-runner.ts and review-runner.ts to
 * eliminate duplication.
 */

/** Extract the last assistant text from a session's message history. */
export function extractLastAssistantText(
  messages: ArrayLike<unknown> | undefined,
): string | undefined {
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: unknown } | undefined;
    if (message?.role !== "assistant") continue;
    const text = extractAssistantText(message.content);
    if (text) return text;
  }
  return undefined;
}

/** Extract text content from a message content value (string | content-part[]). */
export function extractAssistantText(content: unknown): string | undefined {
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
  getSessionStats: () => { tokens?: { input?: number; output?: number; total?: number } },
): { input: number; output: number; total: number } | undefined {
  try {
    const stats = getSessionStats();
    return stats?.tokens
      ? {
          input: stats.tokens.input ?? 0,
          output: stats.tokens.output ?? 0,
          total: stats.tokens.total ?? 0,
        }
      : undefined;
  } catch {
    return undefined;
  }
}
