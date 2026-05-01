// Import extraction for supported files.

import { nodeToRange } from "./coordinates.ts";
import type { TreeSitterRuntime } from "./runtime.ts";
import type { SyntaxNodeLike } from "./syntax-node.ts";
import type { ImportRecord, TreeSitterResult } from "./types.ts";

/** Extract import records from a supported file. */
export async function extractImports(
  runtime: TreeSitterRuntime,
  filePath: string,
): Promise<TreeSitterResult<ImportRecord[]>> {
  const parseResult = await runtime.parseFile(filePath);
  if (parseResult.kind !== "success") return parseResult;

  const { tree, source } = parseResult.data;
  const imports: ImportRecord[] = [];

  try {
    walkForImports(tree.rootNode, source, imports);
    return { kind: "success", data: imports };
  } finally {
    tree.delete();
  }
}

function walkForImports(node: SyntaxNodeLike, source: string, imports: ImportRecord[]): void {
  if (node.type === "import_statement") {
    const sourceNode = node.childForFieldName("source");
    if (sourceNode) {
      const specifier = sourceNode.text.replace(/^["']|["']$/g, "");
      imports.push({
        moduleSpecifier: specifier,
        range: nodeToRange(node, source),
      });
    }
    return;
  }
  for (const child of node.children) {
    walkForImports(child, source, imports);
  }
}
