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
    collectTopLevelExports(tree.rootNode, source, exports);
    return { kind: "success", data: exports };
  } finally {
    tree.delete();
  }
}

/** Only collect file-level exports; nested namespace/module exports are not module exports. */
function collectTopLevelExports(
  rootNode: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  for (const child of rootNode.children) {
    if (child.type !== "export_statement") continue;
    handleExportStatement(child, source, exports);
  }
}

/** Dispatch a single export statement into declaration, re-export, default, or named export records. */
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

  const sourceNode = findStringChild(node);
  if (sourceNode) {
    extractReExport(node, sourceNode, source, exports);
    return;
  }

  if (hasExportAssignment(node)) {
    extractExportAssignment(node, source, exports);
    return;
  }

  if (hasDefaultKeyword(node)) {
    extractDefaultExport(node, source, exports);
    return;
  }

  extractNamedExportClause(node, source, exports);
}

function findDeclarationChild(node: SyntaxNodeLike): SyntaxNodeLike | undefined {
  return node.children.find((child) => DECLARATION_EXPORT_NODE_TYPES.has(child.type));
}

const DECLARATION_EXPORT_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "lexical_declaration",
  "ambient_declaration",
  "internal_module",
  "module",
]);

function extractDeclarationExport(
  decl: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  if (decl.type === "lexical_declaration") {
    extractLexicalDeclarationExports(decl, source, exports);
    return;
  }

  if (decl.type === "ambient_declaration") {
    extractAmbientDeclarationExport(decl, source, exports);
    return;
  }

  const name = getDeclarationName(decl);
  if (!name) return;

  exports.push({
    name,
    kind: exportKindForDeclaration(decl.type),
    range: nodeToRange(decl, source),
  });
}

function extractLexicalDeclarationExports(
  decl: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  for (const child of decl.children) {
    if (child.type !== "variable_declarator") continue;
    const nameNode = findNameNode(child);
    if (!nameNode) continue;
    exports.push({
      name: nameNode.text,
      kind: "variable",
      range: nodeToRange(child, source),
    });
  }
}

/** Extract the declared symbol from `export declare ...` statements. */
function extractAmbientDeclarationExport(
  decl: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const nested = decl.children.find((child) => child.type !== "declare" && child.type !== ";");
  if (!nested) return;

  const name = getDeclarationName(nested);
  if (!name) return;

  exports.push({
    name,
    kind: exportKindForDeclaration(nested.type),
    range: nodeToRange(decl, source),
  });
}

/** Map Tree-sitter declaration node types to stable public export kinds. */
function exportKindForDeclaration(type: string): string {
  switch (type) {
    case "function_declaration":
    case "generator_function_declaration":
    case "function_signature":
      return "function";
    case "class_declaration":
    case "abstract_class_declaration":
      return "class";
    case "interface_declaration":
      return "interface";
    case "type_alias_declaration":
      return "type";
    case "enum_declaration":
      return "enum";
    case "internal_module":
    case "module":
      return "namespace";
    default:
      return type.replace(/_declaration$/, "");
  }
}

function hasDefaultKeyword(node: SyntaxNodeLike): boolean {
  return node.children.some((child) => child.type === "default");
}

function hasExportAssignment(node: SyntaxNodeLike): boolean {
  return node.children.some((child) => child.type === "=");
}

function extractExportAssignment(
  node: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const expr = node.children.find(
    (child) => child.type !== "export" && child.type !== "=" && child.type !== ";",
  );

  exports.push({
    name: expr ? expr.text.substring(0, 60) : "=",
    kind: "export assignment",
    range: nodeToRange(node, source),
  });
}

function extractDefaultExport(node: SyntaxNodeLike, source: string, exports: ExportRecord[]): void {
  const expr = node.children.find(
    (child) => child.type !== "export" && child.type !== "default" && child.type !== ";",
  );
  exports.push({
    name: expr ? expr.text.substring(0, 60) : "default",
    kind: "default export",
    range: nodeToRange(node, source),
  });
}

function findStringChild(node: SyntaxNodeLike): SyntaxNodeLike | undefined {
  return node.children.find((child) => child.type === "string");
}

function extractReExport(
  node: SyntaxNodeLike,
  sourceNode: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const specifier = sourceNode.text.replace(/^["']|["']$/g, "");
  const namespaceExport = node.children.find((child) => child.type === "namespace_export");
  if (namespaceExport) {
    extractNamespaceReExport(namespaceExport, specifier, source, exports);
    return;
  }

  const exportClause = node.children.find((child) => child.type === "export_clause");
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

/** Extract `export * as name from "module"` namespace re-export records. */
function extractNamespaceReExport(
  node: SyntaxNodeLike,
  moduleSpecifier: string,
  source: string,
  exports: ExportRecord[],
): void {
  const nameNode = findNameNode(node);
  if (!nameNode) return;

  exports.push({
    name: nameNode.text,
    kind: "re-export",
    range: nodeToRange(node, source),
    moduleSpecifier,
  });
}

function extractNamedExportClause(
  node: SyntaxNodeLike,
  source: string,
  exports: ExportRecord[],
): void {
  const exportClause = node.children.find((child) => child.type === "export_clause");
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

function findNameNode(node: SyntaxNodeLike): SyntaxNodeLike | null {
  return (
    node.childForFieldName("name") ??
    node.children.find((child) =>
      [
        "identifier",
        "type_identifier",
        "property_identifier",
        "private_property_identifier",
      ].includes(child.type),
    ) ??
    null
  );
}

function getDeclarationName(node: SyntaxNodeLike): string | null {
  const nameNode =
    node.childForFieldName("name") ?? node.children.find((child) => child.type === "string");
  if (!nameNode) return null;
  return nameNode.type === "string" ? stripQuotes(nameNode.text) : nameNode.text;
}

function stripQuotes(text: string): string {
  return text.replace(/^["']|["']$/g, "");
}
