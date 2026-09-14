import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { GrammarId } from "../types.ts";
import { normalizeCallName } from "./call-name.ts";

type CalleeSyntaxChild = SyntaxNodeLike & {
  readonly isExtra: boolean;
};

type CalleeSyntaxNode = SyntaxNodeLike & {
  readonly namedChildren: CalleeSyntaxChild[];
};

type SourcePoint = { row: number; column: number };

type TextReplacement = { start: number; end: number };

type CalleeDisplayNameOptions = {
  node: SyntaxNodeLike;
  grammarId: GrammarId;
  nodeType: string;
  source: string;
  sourceLineStarts: readonly number[];
};

const CALL_NODE_TYPES = new Set([
  "call_expression",
  "call",
  "method_invocation",
  "new_expression",
  "object_creation_expression",
]);

const ARGUMENT_LIST_TYPES = new Set(["arguments", "argument_list", "value_arguments"]);

const RECEIVER_FIELDS = [
  "function",
  "constructor",
  "object",
  "receiver",
  "operand",
  "value",
  "lhs",
  "argument",
] as const;

const RECEIVER_WRAPPER_TYPES = new Set(["navigation_expression", "parenthesized_expression"]);

/**
 * Create a syntax-shortened label for one structural callee capture.
 *
 * The full normalized name remains the identity-bearing value. This helper
 * only replaces argument-list nodes on the receiver chain with `(…)`; it does
 * not inspect arbitrary expression text to find parentheses.
 */
export function createCalleeDisplayName({
  node,
  grammarId,
  nodeType,
  source,
  sourceLineStarts,
}: CalleeDisplayNameOptions): string | undefined {
  const replacements: TextReplacement[] = [];
  collectReceiverArgumentLists(node, replacements, sourceLineStarts);
  const selected = selectNonOverlappingReplacements(replacements);
  const start = sourceOffset(node.startPosition, sourceLineStarts);
  const end = sourceOffset(node.endPosition, sourceLineStarts);
  if (start < 0 || end < start || end > source.length) return undefined;

  let rendered = source.slice(start, end);
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const replacement = selected[index];
    if (!replacement || replacement.start < start || replacement.end > end) continue;
    const relativeStart = replacement.start - start;
    const relativeEnd = replacement.end - start;
    rendered = `${rendered.slice(0, relativeStart)}(…)${rendered.slice(relativeEnd)}`;
  }

  const displayName = normalizeCallName(rendered, grammarId, nodeType);
  return displayName.length > 0 ? displayName : undefined;
}

function collectReceiverArgumentLists(
  node: SyntaxNodeLike,
  replacements: TextReplacement[],
  sourceLineStarts: readonly number[],
): void {
  const argumentList = findArgumentList(node);
  if (argumentList && hasNamedChildren(argumentList)) {
    const start = sourceOffset(argumentList.startPosition, sourceLineStarts);
    const end = sourceOffset(argumentList.endPosition, sourceLineStarts);
    if (start >= 0 && end >= start) replacements.push({ start, end });
  }

  for (const receiver of receiverNodes(node)) {
    collectReceiverArgumentLists(receiver, replacements, sourceLineStarts);
  }
}

function findArgumentList(node: SyntaxNodeLike): SyntaxNodeLike | null {
  if (!CALL_NODE_TYPES.has(node.type)) return null;

  const field = node.childForFieldName("arguments");
  if (field) return field;

  const directArgumentList = node.children.find((child) => ARGUMENT_LIST_TYPES.has(child.type));
  if (directArgumentList) return directArgumentList;

  if (node.type !== "call_expression") return null;
  const callSuffix = node.children.find((child) => child.type === "call_suffix");
  return callSuffix?.children.find((child) => child.type === "value_arguments") ?? null;
}

function receiverNodes(node: SyntaxNodeLike): SyntaxNodeLike[] {
  for (const fieldName of RECEIVER_FIELDS) {
    const field = node.childForFieldName(fieldName);
    if (field) return [field];
  }

  if (node.type === "call_expression") {
    return namedChildren(node).filter(
      (child) => child.type !== "call_suffix" && !ARGUMENT_LIST_TYPES.has(child.type),
    );
  }

  if (!RECEIVER_WRAPPER_TYPES.has(node.type)) return [];
  return namedChildren(node).filter((child) => !ARGUMENT_LIST_TYPES.has(child.type));
}

function namedChildren(node: SyntaxNodeLike): CalleeSyntaxChild[] {
  return (node as CalleeSyntaxNode).namedChildren ?? [];
}

function hasNamedChildren(node: SyntaxNodeLike): boolean {
  return namedChildren(node).some((child) => !child.isExtra);
}

function selectNonOverlappingReplacements(
  replacements: readonly TextReplacement[],
): TextReplacement[] {
  const selected: TextReplacement[] = [];
  const ordered = [...replacements].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );

  for (const replacement of ordered) {
    const previous = selected[selected.length - 1];
    if (previous && replacement.start < previous.end) continue;
    selected.push(replacement);
  }
  return selected;
}

/** Build source offsets for Tree-sitter rows without decoding expression text. */
export function createSourceLineStarts(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  return lineStarts;
}

function sourceOffset(point: SourcePoint, lineStarts: readonly number[]): number {
  const lineStart = lineStarts[point.row];
  return lineStart === undefined ? -1 : lineStart + point.column;
}
