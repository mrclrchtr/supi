// Shared context-message utilities for SuPi extensions.
//
// Provides a generic prune-and-reorder pattern for extensions that inject
// managed context messages (via `before_agent_start` with a `customType` and
// `contextToken`) and maintain them via the `context` event.

/**
 * Minimal message shape needed for context-message operations.
 * Extensions cast their event.messages entries to this type.
 */
export type ContextMessageLike = {
  role?: string;
  customType?: string;
  details?: unknown;
};

/**
 * Extract the `contextToken` string from a message's `details` object.
 * Returns `null` when the token is absent or not a string.
 */
export function getContextToken(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const token = (details as { contextToken?: unknown }).contextToken;
  return typeof token === "string" ? token : null;
}

/**
 * Find the index of the last message with `role: "user"`.
 * Returns `-1` when no user message exists.
 */
export function findLastUserMessageIndex<T extends ContextMessageLike>(messages: T[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

/**
 * Filter stale context messages and reorder the active one before the last user message.
 *
 * - Removes all messages matching `customType` whose token differs from `activeToken`.
 * - When `activeToken` is `null`, removes **all** messages of that `customType`.
 * - If the active context message is after the last user message, moves it before.
 *
 * Returns the modified array, or the original reference when no changes were needed.
 */
export function pruneAndReorderContextMessages<T extends ContextMessageLike>(
  messages: T[],
  customType: string,
  activeToken: string | null,
): T[] {
  // Remove stale messages of the target customType
  const filtered = messages.filter((message) => {
    if (message.customType !== customType) return true;
    if (!activeToken) return false;
    return getContextToken(message.details) === activeToken;
  });

  if (!activeToken) return filtered;

  // Find the active context message
  const contextIndex = filtered.findIndex(
    (message) =>
      message.customType === customType && getContextToken(message.details) === activeToken,
  );
  if (contextIndex === -1) return filtered;

  // Find the last user message
  const userIndex = findLastUserMessageIndex(filtered);
  if (userIndex === -1 || contextIndex < userIndex) return filtered;

  // Move context message before last user message
  const next = [...filtered];
  const [contextMessage] = next.splice(contextIndex, 1);
  if (!contextMessage) return filtered;
  next.splice(userIndex, 0, contextMessage);
  return next;
}
