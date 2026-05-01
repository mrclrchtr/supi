// Node-at-position lookup.

import { nodeToRange, publicToTreeSitter, splitSourceLines } from "./coordinates.ts";
import type { TreeSitterRuntime } from "./runtime.ts";
import type { NodeAtResult, SourceRange, TreeSitterResult } from "./types.ts";

const MAX_ANCESTRY = 10;

/** Find the smallest relevant node at a given 1-based position. */
export async function lookupNodeAt(
  runtime: TreeSitterRuntime,
  filePath: string,
  line: number,
  character: number,
): Promise<TreeSitterResult<NodeAtResult>> {
  if (!Number.isInteger(line) || line < 1) {
    return { kind: "validation-error", message: "line must be a positive 1-based integer" };
  }
  if (!Number.isInteger(character) || character < 1) {
    return { kind: "validation-error", message: "character must be a positive 1-based integer" };
  }

  const parseResult = await runtime.parseFile(filePath);
  if (parseResult.kind !== "success") return parseResult;

  const { tree, source } = parseResult.data;

  try {
    const boundsError = validateBounds(line, character, source);
    if (boundsError) return boundsError;

    const tsPoint = publicToTreeSitter(line, character, source);
    const node = tree.rootNode.descendantForPosition(tsPoint);

    if (!node) {
      return { kind: "runtime-error", message: "No node found at the given position" };
    }

    return {
      kind: "success",
      data: {
        type: node.type,
        range: nodeToRange(node, source),
        text: node.text,
        ancestry: collectAncestry(node, source),
      },
    };
  } finally {
    tree.delete();
  }
}

/** Validate that a requested public position exists in the source text. */
function validateBounds(
  line: number,
  character: number,
  source: string,
): TreeSitterResult<NodeAtResult> | null {
  const lines = splitSourceLines(source);
  if (line > lines.length) {
    return { kind: "validation-error", message: "line is beyond end of file" };
  }

  const lineText = lines[line - 1] ?? "";
  if (character > lineText.length + 1) {
    return { kind: "validation-error", message: "character is beyond end of line" };
  }

  return null;
}

function collectAncestry(
  node: {
    type: string;
    parent: {
      type: string;
      startPosition: { row: number; column: number };
      endPosition: { row: number; column: number };
      parent: unknown;
    } | null;
  },
  source: string,
): Array<{ type: string; range: SourceRange }> {
  const ancestry: Array<{ type: string; range: SourceRange }> = [];
  let parent = node.parent;
  let count = 0;
  while (parent && count < MAX_ANCESTRY) {
    ancestry.push({
      type: parent.type,
      range: nodeToRange(parent, source),
    });
    parent = parent.parent as typeof parent | null;
    count++;
  }
  return ancestry;
}
