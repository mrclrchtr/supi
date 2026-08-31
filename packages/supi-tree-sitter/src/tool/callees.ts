// Structural callee extraction — enclosing-scope lookup with per-language queries.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { validatePublicPositionBounds } from "../coordinates.ts";
import { detectGrammar } from "../language.ts";
import type { GrammarId, SourceRange, TreeSitterResult } from "../types.ts";
import { queryParsedFile, type TreeSitterRuntime } from "../worker/runtime.ts";
import { normalizeCallName } from "./call-name.ts";
import { extractScopeName } from "./scope.ts";

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
  depth: "direct" | "deep";
}

// ── Per-grammar callee queries ────────────────────────────────────────

const CALLEE_QUERIES: Partial<Record<GrammarId, string>> = {
  javascript: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  typescript: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  tsx: "(call_expression function: (_) @callee) (new_expression constructor: (_) @callee)",
  python: "(call function: (_) @callee)",
  rust: "(call_expression function: (_) @callee) (macro_invocation macro: (_) @callee)",
  go: "(call_expression function: (_) @callee)",
  c: "(call_expression function: (_) @callee)",
  cpp: "(call_expression function: (_) @callee)",
  java: "(method_invocation) @callee (object_creation_expression type: (_) @callee)",
  kotlin: "(call_expression) @callee",
  ruby: "(call) @callee",
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
  python: new Set(["function_definition", "lambda"]),
  rust: new Set(["function_item", "closure_expression"]),
  go: new Set(["function_declaration", "method_declaration", "func_literal"]),
  c: new Set(["function_definition"]),
  cpp: new Set(["function_definition", "lambda_expression"]),
  java: new Set(["method_declaration", "constructor_declaration", "lambda_expression"]),
  kotlin: new Set(["function_declaration", "lambda_literal", "anonymous_function"]),
  ruby: new Set(["method", "block", "do_block", "lambda"]),
  bash: new Set(["function_definition"]),
  r: new Set(["function_definition"]),
  html: new Set(),
  sql: new Set(),
};

// ── Main entrypoint ──────────────────────────────────────────────────

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

/**
 * Extract direct structural callee calls for a file at the given position.
 *
 * 1. Parses the file with the Tree-sitter runtime.
 * 2. Finds the enclosing function/method/callback scope at the position.
 * 3. Runs a grammar-specific callee query.
 * 4. Filters to captures within that enclosing scope.
 * 5. Excludes nested function/method/callback scopes that do not contain the anchor.
 * 6. Deduplicates by name.
 */
// biome-ignore lint/complexity/useMaxParams: provider function needs runtime + coordinates + depth
export async function lookupCalleesAt(
  runtime: TreeSitterRuntime,
  filePath: string,
  line: number,
  character: number,
  depth: "direct" | "deep" = "direct",
  control?: CodeRequestControl,
): Promise<TreeSitterResult<CalleesAtResult>> {
  // Validate coordinates and grammar
  const validation = validateCalleeInput(filePath, line, character);
  if (validation.kind !== "ok") return validation;
  const { grammarId } = validation;

  // Parse the file
  const parseResult = await runtime.parseFile(filePath, control);
  if (parseResult.kind !== "success") return parseResult;

  const { tree, source } = parseResult.data;

  try {
    const boundsError = validatePublicPositionBounds(line, character, source);
    if (boundsError) return boundsError;

    const scopes = ENCLOSING_SCOPE_TYPES[grammarId];
    const tsPoint = { row: line - 1, column: character - 1 };
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

    const queryResult = await queryParsedFile(runtime, {
      grammarId,
      tree,
      source,
      queryString: queryStr,
      control,
    });
    if (queryResult.kind !== "success") {
      return {
        kind: "runtime-error",
        message: "Callee query failed",
      };
    }

    const callees = filterCalleeCaptures(
      queryResult.data,
      grammarId,
      enclosingNode,
      scopes,
      tsPoint,
      depth,
    );

    const enclosingRange = nodeToSourceRange(enclosingNode);
    const scopeName = extractScopeName(enclosingNode);

    return {
      kind: "success",
      data: {
        enclosingScope: {
          name: scopeName,
          range: enclosingRange,
        },
        callees,
        depth,
      },
    };
  } finally {
    tree.delete();
  }
}

/**
 * Recursively collect inner function/method/callback scopes that do NOT
 * contain the anchor point. Captures from these ranges are excluded so
 * nested calls are not attributed to the parent scope.
 *
 * Containment compares both row and column to handle same-line nested
 * functions correctly.
 */
function collectInnerScopes(
  node: {
    type: string;
    children: unknown[];
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  } | null,
  scopeTypes: ReadonlySet<string>,
  anchor: { row: number; column: number },
  ranges: Array<{
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
  }>,
): void {
  if (!node) return;
  // biome-ignore lint/complexity/noForEach: safe iteration over node children
  (node.children ?? []).forEach((child) => {
    const childNode = child as {
      type: string;
      startPosition: { row: number; column: number };
      endPosition: { row: number; column: number };
      children: unknown[];
    };
    if (scopeTypes.has(childNode.type)) {
      // Exclude this inner scope if it does NOT contain the anchor point.
      const contains = containsPoint(childNode, anchor);
      if (!contains) {
        ranges.push({
          startRow: childNode.startPosition.row,
          startColumn: childNode.startPosition.column,
          endRow: childNode.endPosition.row,
          endColumn: childNode.endPosition.column,
        });
      }
      // Still recurse into it for deeper nesting
      collectInnerScopes(childNode, scopeTypes, anchor, ranges);
    } else {
      // Recurse into non-scope children to find deeper scopes
      collectInnerScopes(childNode, scopeTypes, anchor, ranges);
    }
  });
}

function containsPoint(
  node: {
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  },
  point: { row: number; column: number },
): boolean {
  const afterStart =
    point.row > node.startPosition.row ||
    (point.row === node.startPosition.row && point.column >= node.startPosition.column);
  const beforeEnd =
    point.row < node.endPosition.row ||
    (point.row === node.endPosition.row && point.column <= node.endPosition.column);
  return afterStart && beforeEnd;
}

/**
 * Filter query captures to only those within the enclosing scope.
 * In `direct` depth, excludes captures that fall within inner nested
 * function/callback scopes. In `deep` depth, all captures within the
 * enclosing scope are included regardless of nesting.
 */
// biome-ignore lint/complexity/useMaxParams: filtering needs captures + node context + depth
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filtering combines scope containment, column-aware inner-scope exclusion, and dedup in one cohesive pass
function filterCalleeCaptures(
  captures: Array<{ nodeType: string; range: SourceRange; text: string }>,
  grammarId: GrammarId,
  // biome-ignore lint/suspicious/noExplicitAny: tree-sitter SyntaxNode is complex
  enclosingNode: any,
  scopeTypes: ReadonlySet<string>,
  anchor: { row: number; column: number },
  depth: "direct" | "deep" = "direct",
): Array<{ name: string; range: SourceRange }> {
  const excludeRanges: Array<{
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
  }> = [];
  if (depth === "direct") {
    collectInnerScopes(enclosingNode, scopeTypes, anchor, excludeRanges);
  }

  const seen = new Set<string>();
  const callees: Array<{ name: string; range: SourceRange }> = [];

  const enclosingStartRow = enclosingNode.startPosition.row;
  const enclosingEndRow = enclosingNode.endPosition.row;
  const enclosingStartColumn = enclosingNode.startPosition.column;
  const enclosingEndColumn = enclosingNode.endPosition.column;

  for (const capture of captures) {
    // Only include captures within the enclosing scope, using columns
    // for same-line containment.
    const capStartLine = capture.range.startLine - 1;
    const capEndLine = capture.range.endLine - 1;
    const capStartChar = capture.range.startCharacter - 1;
    const capEndChar = capture.range.endCharacter - 1;
    if (capStartLine < enclosingStartRow || capEndLine > enclosingEndRow) {
      continue;
    }
    if (capStartLine === enclosingStartRow && capStartChar < enclosingStartColumn) {
      continue;
    }
    if (capEndLine === enclosingEndRow && capEndChar > enclosingEndColumn) {
      continue;
    }

    // In direct depth, exclude captures within inner nested function scopes
    if (depth === "direct") {
      const isInInner = excludeRanges.some(
        (exc) =>
          (capStartLine > exc.startRow ||
            (capStartLine === exc.startRow && capStartChar >= exc.startColumn)) &&
          (capEndLine < exc.endRow || (capEndLine === exc.endRow && capEndChar <= exc.endColumn)),
      );
      if (isInInner) continue;
    }

    const name = normalizeCallName(capture.text, grammarId, capture.nodeType);
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);

    callees.push({ name, range: capture.range });
  }

  return callees;
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Convert a tree-sitter node to a SourceRange using the source text for
 * UTF-16 column conversion. */
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
