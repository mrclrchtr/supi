// Import extraction for supported files.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { ImportRecord, TreeSitterResult } from "../types.ts";
import type { TreeSitterRuntime } from "../worker/runtime.ts";

/** Extract import records from a supported file. */
export async function extractImports(
  runtime: TreeSitterRuntime,
  filePath: string,
  control?: CodeRequestControl,
): Promise<TreeSitterResult<ImportRecord[]>> {
  const parseResult = await runtime.parseFile(filePath, control);
  if (parseResult.kind !== "success") return parseResult;

  const { tree, source } = parseResult.data;
  const imports: ImportRecord[] = [];

  try {
    if (parseResult.data.grammarId === "latex") {
      walkForLatexImports(tree.rootNode, source, imports);
    } else {
      walkForImports(tree.rootNode, source, imports);
    }
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

const LATEX_IMPORT_FIELDS: Readonly<Record<string, string>> = {
  package_include: "paths",
  class_include: "path",
  latex_include: "path",
  biblatex_include: "glob",
  bibstyle_include: "path",
  bibtex_include: "paths",
};

function walkForLatexImports(node: SyntaxNodeLike, source: string, imports: ImportRecord[]): void {
  if (node.type === "import_include") {
    const directory = groupContent(node.childForFieldName("directory"));
    const file = groupContent(node.childForFieldName("file"));
    if (directory || file) {
      const separator = directory && !directory.endsWith("/") ? "/" : "";
      imports.push({
        moduleSpecifier: `${directory}${separator}${file}`,
        range: nodeToRange(node, source),
      });
    }
    return;
  }

  const field = LATEX_IMPORT_FIELDS[node.type];
  if (field) {
    for (const moduleSpecifier of fieldValues(node, field)) {
      if (moduleSpecifier) imports.push({ moduleSpecifier, range: nodeToRange(node, source) });
    }
    return;
  }

  for (const child of node.children) {
    walkForLatexImports(child, source, imports);
  }
}

function fieldValues(node: SyntaxNodeLike, field: string): string[] {
  const value = node.childForFieldName(field);
  if (!value) return [];
  const paths = value.childrenForFieldName("path");
  if (paths.length > 0) return paths.map((path) => path.text.trim()).filter(Boolean);
  return [groupContent(value)];
}

function groupContent(node: SyntaxNodeLike | null): string {
  if (!node) return "";
  const trimmed = node.text.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1).trim() : trimmed;
}
