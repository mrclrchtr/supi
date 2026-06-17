/** File-wide call-site extraction using per-grammar tree-sitter queries. */

import { detectGrammar } from "../language.ts";
import type { TreeSitterRuntime } from "../session/runtime.ts";
import type { CallSiteMatch, GrammarId, TreeSitterResult } from "../types.ts";

// ── Per-grammar call-site queries ─────────────────────────────────────

// JS/TS/TSX queries that capture the full callee expression, not just the leaf name.
// `(_)` matches any expression node, giving us the full callee including member chains
// and nested call expressions (e.g. `factory()()` captures `factory()` for the outer call).
const JS_TS_CALL_SITE_QUERY = [
  // Regular calls: capture the whole callee expression
  "(call_expression function: (_) @call)",
  // New expressions: capture the constructor expression
  "(new_expression constructor: (_) @call)",
].join("\n");

const CALL_SITE_QUERIES: Partial<Record<GrammarId, string>> = {
  javascript: JS_TS_CALL_SITE_QUERY,
  typescript: JS_TS_CALL_SITE_QUERY,
  tsx: JS_TS_CALL_SITE_QUERY,
  python:
    "(call function: (identifier) @call) (call function: (attribute attribute: (identifier) @call))",
  rust: "(call_expression function: (identifier) @call) (call_expression function: (field_expression field: (field_identifier) @call)) (macro_invocation macro: (identifier) @call)",
  go: "(call_expression function: (identifier) @call) (call_expression function: (selector_expression field: (field_identifier) @call))",
  c: "(call_expression function: (identifier) @call)",
  cpp: "(call_expression function: (identifier) @call) (call_expression function: (field_expression field: (field_identifier) @call))",
  java: "(method_invocation name: (identifier) @call) (object_creation_expression type: (type_identifier) @call)",
  kotlin:
    "(call_expression . (simple_identifier) @call) (call_expression . (navigation_expression . (simple_identifier) @call))",
  ruby: "(call method: (identifier) @call)",
  bash: "(command name: (word) @call)",
  r: "(call function: (identifier) @call)",
};

/**
 * Extract all call-site callee expressions from a file.
 *
 * Returns a deduplicated list of { name, startLine } for every call-site
 * captured by the grammar-specific query.
 */
export async function extractCallSites(
  runtime: TreeSitterRuntime,
  filePath: string,
): Promise<TreeSitterResult<CallSiteMatch[]>> {
  const grammarId = detectGrammar(filePath);
  if (!grammarId) {
    return {
      kind: "unsupported-language",
      file: filePath,
      message: `Unsupported file: ${filePath}`,
    };
  }

  const queryStr = CALL_SITE_QUERIES[grammarId];
  if (!queryStr) {
    return {
      kind: "unsupported-language",
      file: filePath,
      message: `callSites is not supported for ${grammarId} files`,
    };
  }

  const queryResult = await runtime.queryFile(filePath, queryStr);
  if (queryResult.kind !== "success") return queryResult;

  const captures = queryResult.data;
  const seen = new Set<string>();
  const matches: CallSiteMatch[] = [];

  for (const capture of captures) {
    // Normalize: trim whitespace and collapse internal whitespace to single space
    const name = capture.text.trim().replace(/\s+/g, " ");
    if (name.length === 0) continue;

    // Deduplicate by name + line
    const key = `${name}:${capture.range.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    matches.push({ name, startLine: capture.range.startLine });
  }

  return { kind: "success", data: matches };
}
