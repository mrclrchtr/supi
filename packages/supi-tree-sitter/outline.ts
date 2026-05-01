// Outline extraction for supported files.

import { nodeToRange } from "./coordinates.ts";
import type { SyntaxNodeLike } from "./syntax-node.ts";
import type { OutlineItem } from "./types.ts";

/** Node types that represent structural declarations for outline. */
const OUTLINE_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function",
  "class_declaration",
  "class",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "method_definition",
  "arrow_function",
  "variable_declarator",
  "export_statement",
  "lexical_declaration",
]);

/** Container node types that have nested children. */
const CONTAINER_NODE_TYPES = new Set([
  "class_declaration",
  "class",
  "interface_declaration",
  "enum_declaration",
  "object",
]);

/** Extract a structural outline from a parsed tree. */
export function collectOutline(rootNode: SyntaxNodeLike, source: string): OutlineItem[] {
  return collectItems(rootNode, source);
}

function collectItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const items: OutlineItem[] = [];

  for (const child of node.children) {
    const item = extractItem(child, source);
    if (item) {
      items.push(item);
    } else {
      items.push(...collectItems(child, source));
    }
  }

  return items;
}

function extractItem(node: SyntaxNodeLike, source: string): OutlineItem | null {
  switch (node.type) {
    case "export_statement":
      return extractExportStatement(node, source);
    case "lexical_declaration":
      return extractLexicalDeclaration(node, source);
    case "function_declaration":
    case "generator_function_declaration":
      return extractNamedDeclaration(node, "function", source);
    case "class_declaration":
    case "class":
      return extractClassDeclaration(node, source);
    case "interface_declaration":
      return extractNamedDeclaration(node, "interface", source);
    case "type_alias_declaration":
      return extractNamedDeclaration(node, "type", source);
    case "enum_declaration":
      return extractNamedDeclaration(node, "enum", source);
    case "method_definition":
      return extractNamedDeclaration(node, "method", source);
    case "variable_declarator":
      return extractVariableDeclarator(node, source);
    default:
      return null;
  }
}

function extractExportStatement(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const decl = node.children.find(
    (c) => OUTLINE_NODE_TYPES.has(c.type) || CONTAINER_NODE_TYPES.has(c.type),
  );
  if (decl) return extractItem(decl, source);

  const defaultDecl = node.children.find((c) => c.type === "default" || c.type === "identifier");
  if (defaultDecl) {
    return {
      name: node.text.replace(/^export\s+/, "").substring(0, 60),
      kind: "export",
      range: nodeToRange(node, source),
    };
  }
  return null;
}

function extractLexicalDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const declarators = node.children.filter((c) => c.type === "variable_declarator");
  if (declarators.length !== 1) return null;

  const decl = declarators[0];
  const nameNode = decl.childForFieldName("name");
  if (!nameNode) return null;

  return {
    name: nameNode.text,
    kind: detectKind(decl),
    range: nodeToRange(decl, source),
  };
}

function extractNamedDeclaration(
  node: SyntaxNodeLike,
  kind: string,
  source: string,
): OutlineItem | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode && kind !== "class") return null;

  const name = nameNode ? nameNode.text : "<anonymous>";
  const hasChildren =
    kind === "class" || kind === "interface" || kind === "function" || kind === "method";

  return {
    name,
    kind,
    range: nodeToRange(node, source),
    ...(hasChildren ? { children: collectChildMethods(node, source) } : {}),
  };
}

function extractClassDeclaration(node: SyntaxNodeLike, source: string): OutlineItem {
  const nameNode = node.childForFieldName("name");
  return {
    name: nameNode ? nameNode.text : "<anonymous>",
    kind: "class",
    range: nodeToRange(node, source),
    children: collectChildMethods(node, source),
  };
}

function extractVariableDeclarator(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  return {
    name: nameNode.text,
    kind: detectKind(node),
    range: nodeToRange(node, source),
  };
}

function detectKind(node: SyntaxNodeLike): string {
  const valueNode = node.childForFieldName("value");
  if (!valueNode) return "variable";
  const vt = valueNode.type;
  if (vt === "arrow_function" || vt === "function_expression") return "function";
  if (vt === "class_expression" || vt === "new_expression") return "class";
  return "variable";
}

function collectChildMethods(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  if (!body) return [];
  const items: OutlineItem[] = [];
  for (const child of body.children) {
    const item = extractItem(child, source);
    if (item) items.push(item);
  }
  return items;
}
