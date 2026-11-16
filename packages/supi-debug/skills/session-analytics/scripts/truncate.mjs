/** Truncation bounds for exported arguments and results; documented in SKILL.md. */
export const LIMITS = { string: 300, array: 10, depth: 4, resultHead: 500, nextHead: 200 };

/** Bound strings, arrays, and nesting so arguments stay parseable but small. */
function bounded(value, state, depth = 0) {
  if (typeof value === "string") {
    if (value.length <= LIMITS.string) return value;
    state.truncated = true;
    return `${value.slice(0, LIMITS.string)}…`;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= LIMITS.depth) {
    state.truncated = true;
    return Array.isArray(value) ? "[…]" : "{…}";
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.array) state.truncated = true;
    return value.slice(0, LIMITS.array).map((item) => bounded(item, state, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, bounded(item, state, depth + 1)]),
  );
}

export function boundedArgs(args) {
  const state = { truncated: false };
  const value = bounded(args ?? null, state);
  return state.truncated ? { args: value, argsTruncated: true } : { args: value };
}

/** Cut text at `limit` UTF-16 units, marking the cut with an ellipsis. */
export function head(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
