// Outline extraction for supported files.

import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";
import { extractBindingIdentifiers } from "./js-binding-pattern.ts";
import { extractPolyglotOutlineItems } from "./outline-polyglot.ts";

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
  "lexical_declaration",
  "ambient_declaration",
  "internal_module",
  "module",
  "function_signature",
]);

/** Extract a structural outline from a parsed tree. */
export function collectOutline(rootNode: SyntaxNodeLike, source: string): OutlineItem[] {
  return collectItems(rootNode, source);
}

function collectItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const items: OutlineItem[] = [];

  for (const child of node.children) {
    const polyglotItems = extractPolyglotOutlineItems(child, source);
    if (polyglotItems) {
      items.push(...polyglotItems);
      continue;
    }

    const extractedItems = extractItems(child, source);
    if (extractedItems) items.push(...extractedItems);
    else items.push(...collectItems(child, source));
  }

  return items;
}

function extractItems(node: SyntaxNodeLike, source: string): OutlineItem[] | null {
  if (node.type === "lexical_declaration") return extractLexicalDeclarationItems(node, source);
  if (node.type === "ambient_declaration") return extractAmbientDeclarationItems(node, source);
  if (node.type === "export_statement") return extractExportStatement(node, source);

  const item = extractItem(node, source);
  return item ? [item] : null;
}

function extractItem(node: SyntaxNodeLike, source: string): OutlineItem | null {
  switch (node.type) {
    case "lexical_declaration":
      return extractLexicalDeclarationItems(node, source)[0] ?? null;
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
      return extractVariableDeclaratorItems(node, source)[0] ?? null;
    case "ambient_declaration":
      return extractAmbientDeclaration(node, source);
    case "internal_module":
    case "module":
      return extractModuleDeclaration(node, source);
    default:
      return null;
  }
}

/** Extract outline items from an export wrapper without exposing local syntax nodes. */
function extractExportStatement(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const decl = node.children.find((child) => OUTLINE_DECLARATION_NODE_TYPES.has(child.type));
  if (decl) {
    if (decl.type === "lexical_declaration") return extractLexicalDeclarationItems(decl, source);
    if (decl.type === "ambient_declaration") return extractAmbientDeclarationItems(decl, source);
    const item = extractItem(decl, source);
    if (item) return [item];
  }

  if (hasDefaultKeyword(node)) {
    return [{ name: "default", kind: "export", range: nodeToRange(node, source) }];
  }

  const exportClause = node.children.find((child) => child.type === "export_clause");
  return exportClause
    ? [
        {
          name: node.text.replace(/^export\s+/, "").substring(0, 60),
          kind: "export",
          range: nodeToRange(node, source),
        },
      ]
    : [];
}

function extractLexicalDeclarationItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  return node.children
    .filter((child) => child.type === "variable_declarator")
    .flatMap((declarator) => extractVariableDeclaratorItems(declarator, source));
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

function extractVariableDeclaratorItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const names = extractBindingIdentifiers(node.childForFieldName("name"));
  const kind = detectKind(node);
  const range = nodeToRange(node, source);
  return names.map((name) => ({ name, kind, range }));
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

function extractAmbientDeclarationItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const declaration = node.children.find((child) => OUTLINE_DECLARATION_NODE_TYPES.has(child.type));
  if (!declaration) return [];
  if (declaration.type === "lexical_declaration") {
    return extractLexicalDeclarationItems(declaration, source);
  }
  const item = extractItem(declaration, source);
  return item ? [item] : [];
}

function extractAmbientDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  return extractAmbientDeclarationItems(node, source)[0] ?? null;
}

function extractModuleDeclaration(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = getModuleName(node);
  if (!name) return null;

  return {
    name,
    kind: "namespace",
    range: nodeToRange(node, source),
  };
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

function getModuleName(node: SyntaxNodeLike): string | null {
  const nameNode =
    node.childForFieldName("name") ?? node.children.find((child) => child.type === "string");
  if (!nameNode) return null;
  return nameNode.type === "string" ? stripQuotes(nameNode.text) : nameNode.text;
}

function stripQuotes(text: string): string {
  return text.replace(/^["']|["']$/g, "");
}

function isFunctionLike(node: SyntaxNodeLike | null): boolean {
  if (!node) return false;
  return ["arrow_function", "function_expression", "generator_function"].includes(node.type);
}
