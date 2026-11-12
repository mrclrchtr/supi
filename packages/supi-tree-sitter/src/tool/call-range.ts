// Callee ranges for grammars whose call queries capture the whole call node.

import { tsPointToPublic } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { GrammarId, SourceRange } from "../types.ts";

/**
 * Return the callee range for a whole-call capture, so call-site ranges cover the
 * callee expression in every grammar (`a.b` in `a.b(1)`), as JS/TS, Python, Go,
 * and Rust queries capture directly. Returns `null` when the capture already is
 * the callee or no narrower callee exists.
 */
export function calleeRangeForCallNode(
  node: SyntaxNodeLike,
  grammarId: GrammarId,
  source: string,
): SourceRange | null {
  const end = calleeEnd(node, grammarId);
  if (!end) return null;
  const start = tsPointToPublic(node.startPosition, source);
  const publicEnd = tsPointToPublic(end, source);
  return {
    startLine: start.line,
    startCharacter: start.character,
    endLine: publicEnd.line,
    endCharacter: publicEnd.character,
  };
}

/**
 * Find the syntax node for one query capture by walking up from the leaf at its start.
 * Returns `null` when no ancestor has the capture's type and range.
 */
export function findCaptureNode(
  root: SyntaxNodeLike & {
    descendantForPosition(point: { row: number; column: number }): SyntaxNodeLike | null;
  },
  capture: { nodeType: string; range: SourceRange },
): SyntaxNodeLike | null {
  const { range } = capture;
  let node = root.descendantForPosition({
    row: range.startLine - 1,
    column: range.startCharacter - 1,
  });
  while (node) {
    if (
      node.type === capture.nodeType &&
      node.startPosition.row === range.startLine - 1 &&
      node.startPosition.column === range.startCharacter - 1 &&
      node.endPosition.row === range.endLine - 1 &&
      node.endPosition.column === range.endCharacter - 1
    ) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

function calleeEnd(
  node: SyntaxNodeLike,
  grammarId: GrammarId,
): { row: number; column: number } | null {
  switch (grammarId) {
    case "java":
      return node.type === "method_invocation"
        ? (node.childForFieldName("name")?.endPosition ?? null)
        : null;
    case "kotlin":
      return node.type === "call_expression" ? (kotlinCallee(node)?.endPosition ?? null) : null;
    case "ruby":
      return node.type === "call"
        ? ((node.childForFieldName("method") ?? node.childForFieldName("receiver"))?.endPosition ??
            null)
        : null;
    default:
      return null;
  }
}

/**
 * Kotlin nests `f(x) { }` as an outer call (lambda-only suffix) wrapping `f(x)`.
 * Treat both as one call so they share the callee `f`; `f(1)(2)` keeps `f(1)` as
 * the outer callee because its suffix has value arguments.
 */
function kotlinCallee(node: SyntaxNodeLike): SyntaxNodeLike | null {
  const callee = node.children[0];
  if (!callee) return null;
  const suffix = node.children.find((child) => child.type === "call_suffix");
  const lambdaOnly =
    suffix !== undefined && !suffix.children.some((child) => child.type === "value_arguments");
  if (callee.type === "call_expression" && lambdaOnly) return kotlinCallee(callee);
  return callee;
}
