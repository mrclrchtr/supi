import type { Node } from "web-tree-sitter";
import type { GrammarId, QueryCapture } from "../types.ts";

const TYPE_ONLY_CONTEXTS = new Set([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "type_alias_declaration",
  "type_query",
  "type_predicate",
  "interface_declaration",
  "implements_clause",
]);

/**
 * Tree-sitter aliases TypeScript import types to call-expression nodes.
 * Exclude those erased references without dropping dynamic import expressions.
 */
export function isTypeOnlyImportCapture(
  root: Node,
  capture: Pick<QueryCapture, "nodeType" | "range">,
  grammarId: GrammarId,
): boolean {
  if (capture.nodeType !== "import" || (grammarId !== "typescript" && grammarId !== "tsx")) {
    return false;
  }

  let node = root.descendantForPosition(
    { row: capture.range.startLine - 1, column: capture.range.startCharacter - 1 },
    { row: capture.range.endLine - 1, column: capture.range.endCharacter - 1 },
  );
  while (node?.parent) {
    const parent = node.parent;
    if (TYPE_ONLY_CONTEXTS.has(parent.type)) return true;
    if (parent.type === "as_expression" || parent.type === "satisfies_expression") {
      const value = parent.firstNamedChild;
      if (value && (node.startIndex !== value.startIndex || node.endIndex !== value.endIndex)) {
        return true;
      }
    }
    node = parent;
  }
  return false;
}
