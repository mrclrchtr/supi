import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

/** Extract C and C++ declarations from their grammar-specific node shapes. */
export function extractCFamilyOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  switch (node.type) {
    case "class_specifier":
      return one(typeContainer(node, "class", source));
    case "struct_specifier":
      return one(typeContainer(node, "struct", source));
    case "union_specifier":
      return one(typeContainer(node, "union", source));
    case "enum_specifier":
      return one(enumContainer(node, source));
    case "type_definition":
      return typeDefinitions(node, source);
    case "alias_declaration":
      return one(named(node, "type", source));
    case "concept_definition":
      return one(named(node, "concept", source));
    case "namespace_definition": {
      const item = namespaceItem(node, source);
      return item ? [item] : collectDeclarations(node.childForFieldName("body"), source);
    }
    case "function_definition":
      return one(declaratorItem(node, "function", source));
    case "declaration":
      return declarationItems(node, "variable", "function", source);
    default:
      return undefined;
  }
}

function one(item: OutlineItem | null): OutlineItem[] {
  return item ? [item] : [];
}

function named(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  return name ? { name: name.text, kind, range: nodeToRange(node, source) } : null;
}

function typeContainer(
  node: SyntaxNodeLike,
  kind: "class" | "struct" | "union",
  source: string,
): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind,
    range: nodeToRange(node, source),
    children: collectTypeMembers(node.childForFieldName("body"), source),
  };
}

function enumContainer(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind: "enum",
    range: nodeToRange(node, source),
    children: enumMembers(node, source),
  };
}

function enumMembers(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  return (
    body?.children.flatMap((child) =>
      child.type === "enumerator" ? one(named(child, "enum-member", source)) : [],
    ) ?? []
  );
}

function typeDefinitions(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const type = node.childForFieldName("type");
  const kind = cTypeKind(type?.type);
  const aliases = declaratorNodes(node).flatMap((declarator) => declaratorNames(declarator));
  if (aliases.length === 0) return [];
  const range = nodeToRange(node, source);
  const children =
    kind === "enum" && type
      ? enumMembers(type, source)
      : type
        ? collectTypeMembers(type.childForFieldName("body"), source)
        : undefined;
  return aliases.map((name) => ({ name, kind, range, ...(children ? { children } : {}) }));
}

function cTypeKind(type: string | undefined): string {
  switch (type) {
    case "class_specifier":
      return "class";
    case "struct_specifier":
      return "struct";
    case "union_specifier":
      return "union";
    case "enum_specifier":
      return "enum";
    default:
      return "type";
  }
}

function namespaceItem(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind: "namespace",
    range: nodeToRange(node, source),
    children: collectDeclarations(node.childForFieldName("body"), source),
  };
}

function collectDeclarations(
  parent: SyntaxNodeLike | null | undefined,
  source: string,
): OutlineItem[] {
  if (!parent) return [];
  return parent.children.flatMap((child) => {
    const items = extractCFamilyOutlineItems(child, source);
    return items ?? collectDeclarations(child, source);
  });
}

function collectTypeMembers(
  body: SyntaxNodeLike | null | undefined,
  source: string,
): OutlineItem[] {
  if (!body) return [];
  return body.children.flatMap((child) => typeMemberItems(child, source));
}

function typeMemberItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  switch (node.type) {
    case "field_declaration":
    case "declaration":
      return declarationItems(node, "field", "method", source);
    case "function_definition":
      return one(declaratorItem(node, "method", source));
    case "class_specifier":
      return one(typeContainer(node, "class", source));
    case "struct_specifier":
      return one(typeContainer(node, "struct", source));
    case "union_specifier":
      return one(typeContainer(node, "union", source));
    case "enum_specifier":
      return one(enumContainer(node, source));
    case "type_definition":
      return typeDefinitions(node, source);
    case "alias_declaration":
      return one(named(node, "type", source));
    case "friend_declaration":
      return [];
    default:
      return node.children.flatMap((child) => typeMemberItems(child, source));
  }
}

function declarationItems(
  node: SyntaxNodeLike,
  valueKind: string,
  functionKind: string,
  source: string,
): OutlineItem[] {
  const range = nodeToRange(node, source);
  return declaratorNodes(node).flatMap((declarator) =>
    declaratorNames(declarator).map((name) => ({
      name,
      kind: isFunctionDeclarator(declarator) ? functionKind : valueKind,
      range,
    })),
  );
}

function declaratorItem(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const declarator = node.childForFieldName("declarator");
  const name = declarator ? declaratorNames(declarator)[0] : undefined;
  return name ? { name, kind, range: nodeToRange(node, source) } : null;
}

function declaratorNodes(node: SyntaxNodeLike): SyntaxNodeLike[] {
  const declarators = node.childrenForFieldName("declarator");
  if (declarators.length > 0) return declarators;
  const declarator = node.childForFieldName("declarator");
  return declarator ? [declarator] : [];
}

function declaratorNames(node: SyntaxNodeLike): string[] {
  if (DECLARATOR_NAME_TYPES.has(node.type)) return [node.text];
  if (node.type === "structured_binding_declarator") {
    return node.children.filter((child) => child.type === "identifier").map((child) => child.text);
  }
  const nested = node.childrenForFieldName("declarator");
  if (nested.length > 0) return nested.flatMap(declaratorNames);
  const declarator = node.childForFieldName("declarator");
  return declarator ? declaratorNames(declarator) : [];
}

function isFunctionDeclarator(node: SyntaxNodeLike): boolean {
  if (node.type === "function_declarator") {
    const subject = node.childForFieldName("declarator");
    return subject?.type !== "parenthesized_declarator" || !containsPointer(subject);
  }
  const declarator = node.childForFieldName("declarator");
  return declarator ? isFunctionDeclarator(declarator) : false;
}

function containsPointer(node: SyntaxNodeLike): boolean {
  if (node.type === "pointer_declarator" || node.type === "reference_declarator") return true;
  return node.children.some(containsPointer);
}

const DECLARATOR_NAME_TYPES = new Set([
  "identifier",
  "field_identifier",
  "type_identifier",
  "qualified_identifier",
  "template_function",
  "operator_name",
  "destructor_name",
]);
