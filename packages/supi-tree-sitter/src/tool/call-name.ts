import type { GrammarId } from "../types.ts";

/** Normalize one grammar node that represents a call callee. */
export function normalizeCallName(text: string, grammarId: GrammarId, nodeType: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  switch (grammarId) {
    case "java":
      return nodeType === "method_invocation"
        ? stripFinalInvocationArguments(normalized)
        : normalized;
    case "kotlin":
      return nodeType === "call_expression" ? stripKotlinCallSuffix(normalized) : normalized;
    case "ruby":
      return nodeType === "call" ? stripRubyCallSuffix(normalized) : normalized;
    default:
      return normalized;
  }
}

function stripKotlinCallSuffix(text: string): string {
  const lambda = topLevelIndex(text, "{");
  const withoutLambda = lambda >= 0 ? text.slice(0, lambda).trim() : text;
  return stripFinalInvocationArguments(withoutLambda);
}

function stripRubyCallSuffix(text: string): string {
  const block = topLevelKeywordIndex(text, "do");
  const withoutBlock = block >= 0 ? text.slice(0, block).trim() : text;
  const bracedBlock = topLevelIndex(withoutBlock, "{");
  const withoutSuffix = bracedBlock >= 0 ? withoutBlock.slice(0, bracedBlock).trim() : withoutBlock;
  const withoutArguments = stripFinalInvocationArguments(withoutSuffix);
  const whitespace = topLevelWhitespaceIndex(withoutArguments);
  return whitespace >= 0 ? withoutArguments.slice(0, whitespace).trim() : withoutArguments;
}

function stripFinalInvocationArguments(text: string): string {
  if (!text.endsWith(")")) return text;
  const openingIndex = findLastTopLevelOpening(text);
  return openingIndex >= 0 ? text.slice(0, openingIndex).trim() : text;
}

function findLastTopLevelOpening(text: string): number {
  let openingIndex = -1;
  scanTopLevel(text, (character, index, depth) => {
    if (character === "(" && depth === 0) openingIndex = index;
    return false;
  });
  return openingIndex;
}

function topLevelKeywordIndex(text: string, keyword: string): number {
  const marker = ` ${keyword}`;
  const index = topLevelIndex(text, marker);
  return index >= 0 ? index + 1 : -1;
}

function topLevelIndex(text: string, marker: string): number {
  return scanTopLevel(
    text,
    (_character, index, depth) => depth === 0 && text.startsWith(marker, index),
  );
}

function topLevelWhitespaceIndex(text: string): number {
  return scanTopLevel(text, (character, _index, depth) => depth === 0 && /\s/.test(character));
}

function scanTopLevel(
  text: string,
  visit: (character: string, index: number, depth: number) => boolean,
): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote !== null) {
      if (character === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (visit(character, index, depth)) return index;
    depth = updateDepth(character, depth);
  }
  return -1;
}

function updateDepth(character: string, depth: number): number {
  if (character === "(" || character === "[" || character === "{") return depth + 1;
  if (character === ")" || character === "]" || character === "}") {
    return Math.max(0, depth - 1);
  }
  return depth;
}
