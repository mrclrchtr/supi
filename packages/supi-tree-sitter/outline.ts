// Outline extraction for supported files.

import { nodeToRange } from "./coordinates.ts";
import type { SyntaxNodeLike } from "./syntax-node.ts";
import type { OutlineItem } from "./types.ts";

/** Node types that can be extracted directly as outline items. */
const OUTLINE_DECLARATION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "class_declaration",
  "abstract_class_declaration",
  "class",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "method_definition",
  "public_field_definition",
  "variable_declarator",
  "ambient_declaration",
  "internal_module",
  "function_signature",
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
    case "function_signature":
      return extractNamedDeclaration(node, "function", source);
    case "class_declaration":
    case "abstract_class_declaration":
    case "class":
      return extractClassDeclaration(node, source);
    case "interface_declaration":
      return extractInterfaceDeclaration(node, source);
    case "type_alias_declaration":
      return extractNamedDeclaration(node, "type", source);
    case "enum_declaration":
      return extractEnumDeclaration(node, source);
    case "method_definition":
      return extractNamedDeclaration(node, "method", source);
    case "public_field_definition":
      return extractFieldDefinition(node, source);
    case "variable_declarator":
      return extractVariableDeclarator(node, source);
    case "ambient_declaration":
      return extractAmbientDeclaration(node, source);
    case "internal_module":
      return extractNamedDeclaration(node, "namespace", source);
    default:
      return null;
  }
}

/** Extract an outline item from an export wrapper without exposing non-extractable syntax nodes. */
function extractExportStatement(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const decl = node.children.find((child) => OUTLINE_DECLARATION_NODE_TYPES.has(child.type));
  if (decl) {
    const item = extractItem(decl, source);
    if (item) return item;
  }

  if (hasDefaultKeyword(node)) {
    return {
      name: "default",
      kind: "export",
      range: nodeToRange(node, source),
    };
  }

  const exportClause = node.children.find((child) => child.type === "export_clause");
  if (exportClause) {
    return {
      name: node.text.replace(/^export\s+/, "").substring(0, 60),
      kind: "export",
      range: nodeToRange(node, source),
    };
  }

  return null;
}

function extractLexicalDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const declarators = node.children.filter((child) => child.type === "variable_declarator");
  if (declarators.length !== 1) return null;
  return extractVariableDeclarator(declarators[0] as SyntaxNodeLike, source);
}

function extractNamedDeclaration(
  node: SyntaxNodeLike,
  kind: string,
  source: string,
): OutlineItem | null {
  const nameNode = findNameNode(node);
  if (!nameNode) return null;

  return {
    name: nameNode.text,
    kind,
    range: nodeToRange(node, source),
  };
}

function extractClassDeclaration(node: SyntaxNodeLike, source: string): OutlineItem {
  const nameNode = findNameNode(node);
  return {
    name: nameNode ? nameNode.text : "<anonymous>",
    kind: "class",
    range: nodeToRange(node, source),
    children: collectClassMembers(node, source),
  };
}

function extractInterfaceDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const item = extractNamedDeclaration(node, "interface", source);
  if (!item) return null;
  return { ...item, children: collectInterfaceMembers(node, source) };
}

function extractEnumDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const item = extractNamedDeclaration(node, "enum", source);
  if (!item) return null;
  return { ...item, children: collectEnumMembers(node, source) };
}

function extractVariableDeclarator(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const nameNode = findNameNode(node);
  if (!nameNode) return null;
  return {
    name: nameNode.text,
    kind: detectKind(node),
    range: nodeToRange(node, source),
  };
}

function extractFieldDefinition(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const nameNode = findNameNode(node);
  if (!nameNode) return null;
  return {
    name: nameNode.text,
    kind: isFunctionLike(node.childForFieldName("value")) ? "field-function" : "field",
    range: nodeToRange(node, source),
  };
}

function extractAmbientDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const declaration = node.children.find((child) => OUTLINE_DECLARATION_NODE_TYPES.has(child.type));
  return declaration ? extractItem(declaration, source) : null;
}

function detectKind(node: SyntaxNodeLike): string {
  const valueNode = node.childForFieldName("value");
  if (!valueNode) return "variable";
  if (isFunctionLike(valueNode)) return "function";
  if (valueNode.type === "class" || valueNode.type === "class_expression") return "class";
  return "variable";
}

/** Collect supported class members without descending into method implementation bodies. */
function collectClassMembers(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  if (!body) return [];

  const items: OutlineItem[] = [];
  for (const child of body.children) {
    if (child.type !== "method_definition" && child.type !== "public_field_definition") continue;
    const item = extractItem(child, source);
    if (item) items.push(item);
  }
  return items;
}

/** Collect interface signatures as shallow member outline items. */
function collectInterfaceMembers(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  if (!body) return [];

  const items: OutlineItem[] = [];
  for (const child of body.children) {
    const item = extractInterfaceMember(child, source);
    if (item) items.push(item);
  }
  return items;
}

function extractInterfaceMember(node: SyntaxNodeLike, source: string): OutlineItem | null {
  if (node.type === "method_signature") return memberItem(node, "method", source);
  if (node.type === "property_signature") return memberItem(node, "property", source);
  return null;
}

/** Collect enum members from both bare identifiers and assigned members. */
function collectEnumMembers(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  if (!body) return [];

  const items: OutlineItem[] = [];
  for (const child of body.children) {
    if (child.type !== "property_identifier" && child.type !== "enum_assignment") continue;
    const item = memberItem(child, "enum-member", source);
    if (item) items.push(item);
  }
  return items;
}

function memberItem(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const nameNode = findNameNode(node);
  if (!nameNode) return null;
  return {
    name: nameNode.text,
    kind,
    range: nodeToRange(node, source),
  };
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

function hasDefaultKeyword(node: SyntaxNodeLike): boolean {
  return node.children.some((child) => child.type === "default");
}

function isFunctionLike(node: SyntaxNodeLike | null): boolean {
  if (!node) return false;
  return ["arrow_function", "function_expression", "generator_function"].includes(node.type);
}
