// Export extraction for supported files.

import { nodeToRange } from "./coordinates.ts";
import type { TreeSitterRuntime } from "./runtime.ts";
import type { SyntaxNodeLike } from "./syntax-node.ts";
import type { ExportRecord, TreeSitterResult } from "./types.ts";

/** Extract export records from a supported file. */
export async function extractExports(
  runtime: TreeSitterRuntime,
  filePath: string,
): Promise<TreeSitterResult<ExportRecord[]>> {
  const parseResult = await runtime.parseFile(filePath);
  if (parseResult.kind !== "success") return parseResult;

  const { tree, source } = parseResult.data;
  const exports: ExportRecord[] = [];

  try {
    walkForExports(tree.rootNode, source, exports);
    return { kind: "success", data: exports };
  } finally {
    tree.delete();
  }
}

function walkForExports(node: SyntaxNodeLike, source: string, exports: ExportRecord[]): void {
  if (node.type !== "export_statement") {
    for (const child of node.children) {
      walkForExports(child, source, exports);
    }
    return;
  }

  handleExportStatement(node, source, exports);
}

function handleExportStatement(
  node: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const decl = findDeclarationChild(node);

  if (decl) {
    extractDeclarationExport(decl, source, exports);
    return;
  }

  if (hasDefaultKeyword(node)) {
    extractDefaultExport(node, source, exports);
    return;
  }

  const sourceNode = findStringChild(node);
  if (sourceNode) {
    extractReExport(node, sourceNode, source, exports);
    return;
  }

  extractNamedExportClause(node, source, exports);
}

function findDeclarationChild(node: SyntaxNodeLike): SyntaxNodeLike | undefined {
  const declTypes = new Set([
    "function_declaration",
    "class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "lexical_declaration",
  ]);
  return node.children.find((c) => declTypes.has(c.type));
}

function extractDeclarationExport(
  decl: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  if (decl.type === "lexical_declaration") {
    for (const child of decl.children) {
      if (child.type === "variable_declarator") {
        const vn = child.childForFieldName("name");
        if (vn) {
          exports.push({
            name: vn.text,
            kind: "variable",
            range: nodeToRange(child, source),
          });
        }
      }
    }
    return;
  }

  const nameNode =
    decl.childForFieldName("name") ?? decl.children.find((c) => c.type === "identifier");

  if (nameNode) {
    exports.push({
      name: nameNode.text,
      kind: decl.type.replace("_declaration", "").replace("lexical_", "variable "),
      range: nodeToRange(decl, source),
    });
  }
}

function hasDefaultKeyword(node: SyntaxNodeLike): boolean {
  return node.children.some((c) => c.type === "default");
}

function extractDefaultExport(node: SyntaxNodeLike, source: string, exports: ExportRecord[]): void {
  const expr = node.children.find(
    (c) => c.type !== "export" && c.type !== "default" && c.type !== ";",
  );
  exports.push({
    name: expr ? expr.text.substring(0, 60) : "default",
    kind: "default export",
    range: nodeToRange(node, source),
  });
}

function findStringChild(node: SyntaxNodeLike): SyntaxNodeLike | undefined {
  return node.children.find((c) => c.type === "string");
}

function extractReExport(
  node: SyntaxNodeLike,
  sourceNode: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const specifier = sourceNode.text.replace(/^["']|["']$/g, "");
  const exportClause = node.children.find((c) => c.type === "export_clause");

  if (exportClause) {
    extractExportSpecifiers(exportClause, source, exports, {
      kind: "re-export",
      moduleSpecifier: specifier,
    });
    return;
  }

  exports.push({
    name: "*",
    kind: "re-export",
    range: nodeToRange(node, source),
    moduleSpecifier: specifier,
  });
}

function extractNamedExportClause(
  node: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const exportClause = node.children.find((c) => c.type === "export_clause");
  if (!exportClause) return;

  extractExportSpecifiers(exportClause, source, exports, { kind: "export" });
}

function extractExportSpecifiers(
  exportClause: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
  options: { kind: "export" | "re-export"; moduleSpecifier?: string },
): void {
  for (const child of exportClause.children) {
    if (child.type !== "export_specifier") continue;
    const exportedName = child.childForFieldName("alias") ?? child.childForFieldName("name");
    if (!exportedName) continue;
    exports.push({
      name: exportedName.text,
      kind: options.kind,
      range: nodeToRange(child, source),
      ...(options.moduleSpecifier ? { moduleSpecifier: options.moduleSpecifier } : {}),
    });
  }
}
