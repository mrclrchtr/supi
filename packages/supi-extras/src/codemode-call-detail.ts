/**
 * Key-argument extraction for nested codemode calls: the path, command, or
 * query that best identifies a call in a compact row.
 */

const ARG_KEYS = ["path", "file", "command", "query", "pattern", "url"] as const;

type Args = Record<string, unknown>;

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value.split("\n")[0] : undefined;

/** `file:line` for a code-intelligence anchor. */
const anchor = (value: unknown): string | undefined => {
  const { file, line } = (value ?? {}) as Args;
  return text(file) && (typeof line === "number" ? `${file}:${line}` : text(file));
};

/** Code-intelligence target: anchor, symbol query, file, or handle. */
const target = (value: unknown): string | undefined => {
  const t = (value ?? {}) as Args;
  return (
    anchor(t.anchor) ??
    text((t.symbol as Args | undefined)?.query) ??
    text(t.file) ??
    text(t.handle)
  );
};

/** Detail extractors for tools whose key argument is nested or ambiguous. */
const TOOL_DETAILS: Record<string, (args: Args) => string | undefined> = {
  code_resolve: (args) => target(args.target),
  code_graph: (args) => target(args.target),
  code_inspect: (args) => anchor(args.anchor),
  code_health: (args) => text(args.scope) ?? "workspace",
  code_orientation: (args) => {
    const focus = (args.focus ?? {}) as Args;
    return text(focus.path) ?? text(focus.module) ?? target(focus.target);
  },
  code_find: (args) => {
    const search = (args.search ?? {}) as Args;
    return (
      text((search.semantic as Args | undefined)?.query) ??
      text((search.ast as Args | undefined)?.query)
    );
  },
};

/** The most telling argument: a path, command, or query; otherwise the raw JSON. */
export function callDetail(args: string, toolName = ""): string {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed === "object" && parsed !== null) {
      const found = TOOL_DETAILS[toolName]?.(parsed as Args) ?? findDetail(parsed, 3);
      if (found) return found;
    }
  } catch {
    // Pi truncates long argument JSON for display.
  }
  return args;
}

/** First known key with a string value, searching nested objects up to `depth` levels. */
function findDetail(value: unknown, depth: number): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Args;
  for (const key of ARG_KEYS) {
    const found = text(record[key]);
    if (found) return found;
  }
  if (depth <= 1) return undefined;
  for (const nested of Object.values(record)) {
    const found = findDetail(nested, depth - 1);
    if (found) return found;
  }
  return undefined;
}
