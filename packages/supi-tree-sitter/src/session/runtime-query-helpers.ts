import type { QueryMatch } from "web-tree-sitter";
import { nodeToRange } from "../coordinates.ts";
import type { QueryCapture, TreeSitterResult } from "../types.ts";

/** Validate one bounded Tree-sitter query before compilation. */
export function validateQueryString(queryString: string): TreeSitterResult<QueryCapture[]> | null {
  if (!queryString || queryString.trim().length === 0) {
    return { kind: "validation-error", message: "query is required and must be non-empty" };
  }
  if (queryString.length > MAX_QUERY_LENGTH) {
    return {
      kind: "validation-error",
      message: `query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
    };
  }
  return null;
}

/** Convert provider query matches to source-backed captures. */
export function collectQueryCaptures(matches: QueryMatch[], source: string): QueryCapture[] {
  const captures: QueryCapture[] = [];
  for (const match of matches) {
    for (const { name, node } of match.captures) {
      captures.push({
        name,
        nodeType: node.type,
        range: nodeToRange(node, source),
        text: node.text,
      });
    }
  }
  return captures;
}

/** Format one runtime failure without exposing more than its first cause. */
export function formatRuntimeError(error: unknown, fallback = "Operation failed"): string {
  if (!(error instanceof Error)) return String(error || fallback);
  if (error.cause instanceof Error) return `${error.message}: ${error.cause.message}`;
  return error.message || fallback;
}

/** Bound query text to reduce pathological query compilation. */
const MAX_QUERY_LENGTH = 10_000;
