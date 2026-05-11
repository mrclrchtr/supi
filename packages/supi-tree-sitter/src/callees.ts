// Structural callee extraction — enclosing-scope lookup with per-language queries.

import { detectGrammar } from "./language.ts";
import type { TreeSitterRuntime } from "./runtime.ts";
import type { GrammarId, SourceRange, TreeSitterResult } from "./types.ts";

/** Result shape returned by lookupCalleesAt. */
export interface CalleesAtResult {
  enclosingScope: {
    name: string;
    range: SourceRange;
  };
  callees: Array<{
    name: string;
    range: SourceRange;
  }>;
}

// ── Per-grammar callee queries ────────────────────────────────────────

const CALLEE_QUERIES: Partial<Record<GrammarId, string>> = {
  javascript: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  typescript: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  tsx: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  python: "(call function: (_) @callee)",
  rust: "(call_expression function: (_) @callee) (macro_invocation) @callee",
  go: "(call_expression function: (_) @callee)",
  c: "(call_expression function: (_) @callee)",
  cpp: "(call_expression function: (_) @callee)",
  java: "(method_invocation name: (_) @callee) (object_creation_expression type: (_) @callee)",
  kotlin: "(call_expression . (_) @callee)",
  ruby: "(call method: (_) @callee)",
  bash: "(command . (_) @callee)",
  r: "(call function: (_) @callee)",
};

// ── Enclosing scope node types per grammar ────────────────────────────

const ENCLOSING_SCOPE_TYPES: Record<GrammarId, ReadonlySet<string>> = {
  javascript: new Set([
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
  ]),
  typescript: new Set([
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
  ]),
  tsx: new Set([
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
  ]),
  python: new Set(["function_definition"]),
  rust: new Set(["function_item"]),
  go: new Set(["function_declaration"]),
  c: new Set(["function_definition"]),
  cpp: new Set(["function_definition"]),
  java: new Set(["method_declaration"]),
  kotlin: new Set(["function_declaration"]),
  ruby: new Set(["method"]),
  bash: new Set(["function_definition"]),
  r: new Set(["function_definition"]),
  html: new Set(),
  sql: new Set(),
};

// ── Name extraction from enclosing scope text ─────────────────────────

/** Extract a best-effort name from an enclosing scope node's source text. */
function extractScopeName(_type: string, text: string): string {
  // JS/TS/Go/Rust: `function foo` or `fn foo` or `def foo`
  // Python: `def foo`
  const firstLine = text.split("\n")[0] ?? text;
  const match = firstLine.match(/(?:function|fn|func|def|method)\s+(\w+)/);
  if (match?.[1]) return match[1];

  // Ruby: `def foo`
  const rubyMatch = firstLine.match(/def\s+(\w+)/);
  if (rubyMatch?.[1]) return rubyMatch[1];

  // Bash: `foo()`
  const bashMatch = firstLine.match(/^(\w+)\s*\(\)/);
  if (bashMatch?.[1]) return bashMatch[1];

  // Kotlin/Java: `fun foo` or `fun Foo.bar()` — extract the last name part
  const kotlinMatch = firstLine.match(/fun\s+(?:[\w.]+\.)?(\w+)/);
  if (kotlinMatch?.[1]) return kotlinMatch[1];

  // C++: type name(params) { — heuristic: first word before `(`
  const cLikeMatch = firstLine.match(
    /(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?[{;]/,
  );
  if (cLikeMatch?.[1]) return cLikeMatch[1];

  return "anonymous";
}

// ── Main entrypoint ──────────────────────────────────────────────────

/**
 * Extract structural callee calls for a file at the given position.
 *
 * 1. Parses the file with the Tree-sitter runtime.
 * 2. Finds the enclosing function/method scope at the position.
 * 3. Runs a grammar-specific callee query.
 * 4. Filters to captures within the enclosing scope.
 * 5. Deduplicates by name.
 */
/** Validate that coordinates are usable and grammar is supported. */
function validateCalleeInput(
  filePath: string,
  line: number,
  character: number,
): { kind: "ok"; grammarId: GrammarId } | TreeSitterResult<CalleesAtResult> {
  if (!Number.isInteger(line) || line < 1) {
    return {
      kind: "validation-error" as const,
      message: "line must be a positive 1-based integer",
    };
  }
  if (!Number.isInteger(character) || character < 1) {
    return {
      kind: "validation-error" as const,
      message: "character must be a positive 1-based integer",
    };
  }

  const grammarId = detectGrammar(filePath);
  if (!grammarId) {
    return {
      kind: "unsupported-language" as const,
      file: filePath,
      message: `Unsupported file: ${filePath}`,
    };
  }

  if (!CALLEE_QUERIES[grammarId]) {
    return {
      kind: "unsupported-language" as const,
      file: filePath,
      message: `callees is not supported for ${grammarId} files`,
    };
  }

  return { kind: "ok", grammarId };
}

/** Find the enclosing function/method node at a position in the tree. */
function findEnclosingScope(
  // biome-ignore lint/suspicious/noExplicitAny: tree-sitter SyntaxNode is complex
  node: any,
  scopeTypes: ReadonlySet<string>,
  // biome-ignore lint/suspicious/noExplicitAny: tree-sitter SyntaxNode is complex
): any | null {
  let current = node;
  while (current) {
    if (scopeTypes.has(current.type)) return current;
    current = current.parent;
  }
  return null;
}

export async function lookupCalleesAt(
  runtime: TreeSitterRuntime,
  filePath: string,
  line: number,
  character: number,
): Promise<TreeSitterResult<CalleesAtResult>> {
  // Validate coordinates and grammar
  const validation = validateCalleeInput(filePath, line, character);
  if (validation.kind !== "ok") return validation;
  const { grammarId } = validation;

  // Parse the file
  const parseResult = await runtime.parseFile(filePath);
  if (parseResult.kind !== "success") return parseResult;

  const { tree } = parseResult.data;

  try {
    const scopes = ENCLOSING_SCOPE_TYPES[grammarId];
    const tsPoint = tsPosition(line, character);
    const node = tree.rootNode.descendantForPosition(tsPoint);

    if (!node) {
      return {
        kind: "runtime-error",
        message: "No node found at the given position",
      };
    }

    const enclosingNode = findEnclosingScope(node, scopes);
    if (!enclosingNode) {
      return {
        kind: "runtime-error",
        message: "No enclosing function or method found at the given position",
      };
    }

    const queryStr = CALLEE_QUERIES[grammarId];
    if (!queryStr) {
      return {
        kind: "runtime-error",
        message: `No callee query configured for ${grammarId}`,
      };
    }

    const queryResult = await runtime.queryFile(filePath, queryStr);
    if (queryResult.kind !== "success") {
      return {
        kind: "runtime-error",
        message: "Callee query failed",
      };
    }

    const callees = filterCalleeCaptures(queryResult.data, enclosingNode, scopes, tsPoint.row);

    const enclosingRange = nodeToSourceRange(enclosingNode);
    const scopeName = extractScopeName(enclosingNode.type, enclosingNode.text);

    return {
      kind: "success",
      data: {
        enclosingScope: {
          name: scopeName,
          range: enclosingRange,
        },
        callees,
      },
    };
  } finally {
    tree.delete();
  }
}

/**
 * Recursively collect line ranges of inner function/method scopes that do not
 * contain the anchor row. Captures from these ranges are excluded so that
 * nested function calls are not attributed to the parent scope.
 */
function collectInnerScopes(
  node: {
    type: string;
    children: unknown[];
    startPosition: { row: number };
    endPosition: { row: number };
  } | null,
  scopeTypes: ReadonlySet<string>,
  anchorRow: number,
  ranges: Array<{ startRow: number; endRow: number }>,
): void {
  if (!node) return;
  // biome-ignore lint/complexity/noForEach: safe iteration over node children
  (node.children ?? []).forEach((child) => {
    const childNode = child as {
      type: string;
      startPosition: { row: number };
      endPosition: { row: number };
      children: unknown[];
    };
    if (scopeTypes.has(childNode.type)) {
      // Exclude this inner scope if it does NOT contain the anchor
      if (!(childNode.startPosition.row <= anchorRow && childNode.endPosition.row >= anchorRow)) {
        ranges.push({
          startRow: childNode.startPosition.row + 1,
          endRow: childNode.endPosition.row + 1,
        });
      }
      // Still recurse into it for deeper nesting
      collectInnerScopes(childNode, scopeTypes, anchorRow, ranges);
    } else {
      // Recurse into non-scope children to find deeper scopes
      collectInnerScopes(childNode, scopeTypes, anchorRow, ranges);
    }
  });
}

/**
 * Filter query captures to only those within the enclosing scope,
 * excluding any that fall within inner nested function scopes.
 */
function filterCalleeCaptures(
  captures: Array<{ range: SourceRange; text: string }>,
  // biome-ignore lint/suspicious/noExplicitAny: tree-sitter SyntaxNode is complex
  enclosingNode: any,
  scopeTypes: ReadonlySet<string>,
  anchorRow: number,
): Array<{ name: string; range: SourceRange }> {
  const excludeRanges: Array<{ startRow: number; endRow: number }> = [];
  collectInnerScopes(enclosingNode, scopeTypes, anchorRow, excludeRanges);

  const seen = new Set<string>();
  const callees: Array<{ name: string; range: SourceRange }> = [];

  const enclosingStartRow = enclosingNode.startPosition.row + 1;
  const enclosingEndRow = enclosingNode.endPosition.row + 1;

  for (const capture of captures) {
    // Only include captures within the enclosing scope
    if (capture.range.startLine < enclosingStartRow || capture.range.endLine > enclosingEndRow) {
      continue;
    }

    // Exclude captures that fall within inner nested function scopes
    const isInInner = excludeRanges.some(
      (exc) => capture.range.startLine >= exc.startRow && capture.range.endLine <= exc.endRow,
    );
    if (isInInner) continue;

    const name = capture.text.replace(/\s+/g, "").slice(0, 60);
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);

    callees.push({ name, range: capture.range });
  }

  return callees;
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Convert a tree-sitter node to a SourceRange. */
function nodeToSourceRange(node: {
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
}): SourceRange {
  return {
    startLine: node.startPosition.row + 1,
    startCharacter: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endCharacter: node.endPosition.column + 1,
  };
}

/** Convert 1-based position to tree-sitter 0-based point. */
function tsPosition(line: number, character: number): { row: number; column: number } {
  return { row: line - 1, column: character - 1 };
}
