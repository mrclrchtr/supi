import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

/** Extract Java and Kotlin declarations from their grammar-specific node shapes. */
export function extractJvmOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  switch (node.type) {
    case "class_declaration":
      return classDeclaration(node, source);
    case "interface_declaration":
      return javaContainer(node, "interface", source);
    case "enum_declaration":
      return javaContainer(node, "enum", source);
    case "record_declaration":
      return one(javaRecord(node, source));
    case "annotation_type_declaration":
      return one(javaContainerItem(node, "interface", source));
    case "module_declaration":
      return one(javaNamed(node, "module", source));
    case "object_declaration":
      return one(kotlinObject(node, source));
    case "function_declaration":
      return kotlinFunction(node, "function", source);
    case "property_declaration":
      return kotlinProperties(node, undefined, source);
    default:
      return undefined;
  }
}

function one(item: OutlineItem | null): OutlineItem[] {
  return item ? [item] : [];
}

function classDeclaration(node: SyntaxNodeLike, source: string): OutlineItem[] | undefined {
  if (!node.childForFieldName("name") && directChild(node, "type_identifier")) {
    return one(kotlinClass(node, source));
  }
  const body = node.childForFieldName("body");
  if (!body?.children.some((child) => JAVA_CLASS_MEMBER_TYPES.has(child.type))) {
    return undefined;
  }
  return one(javaContainerItem(node, "class", source));
}

function javaContainer(
  node: SyntaxNodeLike,
  kind: "interface" | "enum",
  source: string,
): OutlineItem[] | undefined {
  const body = node.childForFieldName("body");
  if (!body?.children.some((child) => JAVA_CONTAINER_MEMBER_TYPES.has(child.type))) {
    return undefined;
  }
  return one(javaContainerItem(node, kind, source));
}

function javaContainerItem(
  node: SyntaxNodeLike,
  kind: "class" | "interface" | "enum",
  source: string,
): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind,
    range: nodeToRange(node, source),
    children: javaMembers(node.childForFieldName("body"), name.text, source),
  };
}

function javaRecord(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind: "record",
    range: nodeToRange(node, source),
    children: [
      ...javaRecordFields(node.childForFieldName("parameters"), source),
      ...javaMembers(node.childForFieldName("body"), name.text, source),
    ],
  };
}

function javaRecordFields(
  parameters: SyntaxNodeLike | null | undefined,
  source: string,
): OutlineItem[] {
  if (!parameters) return [];
  return parameters.children.flatMap((child) => {
    if (child.type !== "formal_parameter" && child.type !== "spread_parameter") return [];
    return one(javaNamed(child, "field", source));
  });
}

function javaMembers(
  parent: SyntaxNodeLike | null | undefined,
  ownerName: string,
  source: string,
): OutlineItem[] {
  if (!parent) return [];
  return parent.children.flatMap((child) => javaMemberItems(child, ownerName, source));
}

function javaMemberItems(node: SyntaxNodeLike, ownerName: string, source: string): OutlineItem[] {
  switch (node.type) {
    case "field_declaration":
    case "constant_declaration":
      return javaVariables(node, "field", source);
    case "constructor_declaration":
      return one(javaNamed(node, "method", source));
    case "compact_constructor_declaration":
      return [{ name: ownerName, kind: "method", range: nodeToRange(node, source) }];
    case "method_declaration":
    case "annotation_type_element_declaration":
      return one(javaNamed(node, "method", source));
    case "enum_constant":
      return one(javaNamed(node, "enum-member", source));
    case "enum_body_declarations":
      return javaMembers(node, ownerName, source);
    case "class_declaration":
      return one(javaContainerItem(node, "class", source) ?? javaNamed(node, "class", source));
    case "interface_declaration":
      return one(
        javaContainerItem(node, "interface", source) ?? javaNamed(node, "interface", source),
      );
    case "enum_declaration":
      return one(javaContainerItem(node, "enum", source) ?? javaNamed(node, "enum", source));
    case "record_declaration":
      return one(javaRecord(node, source));
    case "annotation_type_declaration":
      return one(
        javaContainerItem(node, "interface", source) ?? javaNamed(node, "interface", source),
      );
    default:
      return [];
  }
}

function javaVariables(node: SyntaxNodeLike, kind: string, source: string): OutlineItem[] {
  const range = nodeToRange(node, source);
  return node.childrenForFieldName("declarator").flatMap((declarator) => {
    const name = declarator.childForFieldName("name");
    return name ? [{ name: name.text, kind, range }] : [];
  });
}

function javaNamed(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  return name ? { name: name.text, kind, range: nodeToRange(node, source) } : null;
}

function kotlinClass(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = directChild(node, "type_identifier");
  if (!name) return null;
  const kind = hasDirectToken(node, "interface")
    ? "interface"
    : hasDirectToken(node, "enum")
      ? "enum"
      : "class";
  const body = node.children.find(
    (child) => child.type === "class_body" || child.type === "enum_class_body",
  );
  return {
    name: name.text,
    kind,
    range: nodeToRange(node, source),
    children: [...kotlinConstructorFields(node, source), ...kotlinMembers(body, name.text, source)],
  };
}

function kotlinObject(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = directChild(node, "type_identifier");
  if (!name) return null;
  const body = directChild(node, "class_body");
  return {
    name: name.text,
    kind: "object",
    range: nodeToRange(node, source),
    children: kotlinMembers(body, name.text, source),
  };
}

function kotlinCompanion(node: SyntaxNodeLike, source: string): OutlineItem {
  const name = directChild(node, "type_identifier")?.text ?? "Companion";
  return {
    name,
    kind: "object",
    range: nodeToRange(node, source),
    children: kotlinMembers(directChild(node, "class_body"), name, source),
  };
}

function kotlinMembers(
  parent: SyntaxNodeLike | null | undefined,
  ownerName: string,
  source: string,
): OutlineItem[] {
  if (!parent) return [];
  return parent.children.flatMap((child) => {
    switch (child.type) {
      case "property_declaration":
        return kotlinProperties(child, "field", source);
      case "function_declaration":
        return kotlinFunction(child, "method", source) ?? [];
      case "secondary_constructor":
        return [{ name: ownerName, kind: "method", range: nodeToRange(child, source) }];
      case "class_declaration":
        return one(kotlinClass(child, source));
      case "object_declaration":
        return one(kotlinObject(child, source));
      case "companion_object":
        return [kotlinCompanion(child, source)];
      case "type_alias":
        return one(kotlinTypeAlias(child, source));
      case "enum_entry":
        return one(kotlinSimpleNamed(child, "enum-member", source));
      default:
        return [];
    }
  });
}

function kotlinConstructorFields(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const primaryConstructor = directChild(node, "primary_constructor");
  if (!primaryConstructor) return [];
  return primaryConstructor.children.flatMap((child) => {
    if (child.type !== "class_parameter" || !directChild(child, "binding_pattern_kind")) return [];
    return one(kotlinSimpleNamed(child, "field", source));
  });
}

function kotlinFunction(
  node: SyntaxNodeLike,
  kind: "function" | "method",
  source: string,
): OutlineItem[] | undefined {
  if (node.childForFieldName("name")) return undefined;
  return one(kotlinSimpleNamed(node, kind, source));
}

function kotlinProperties(
  node: SyntaxNodeLike,
  memberKind: "field" | undefined,
  source: string,
): OutlineItem[] {
  const kind = memberKind ?? (containsToken(node, "const") ? "constant" : "variable");
  const declarations = node.children.filter(
    (child) => child.type === "variable_declaration" || child.type === "multi_variable_declaration",
  );
  const range = nodeToRange(node, source);
  return declarations.flatMap((declaration) =>
    simpleIdentifiers(declaration).map((name) => ({ name, kind, range })),
  );
}

function kotlinTypeAlias(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const name = directChild(node, "type_identifier");
  return name ? { name: name.text, kind: "type", range: nodeToRange(node, source) } : null;
}

function kotlinSimpleNamed(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = directChild(node, "simple_identifier");
  return name ? { name: name.text, kind, range: nodeToRange(node, source) } : null;
}

function simpleIdentifiers(node: SyntaxNodeLike): string[] {
  if (node.type === "simple_identifier") return [node.text];
  return node.children.flatMap(simpleIdentifiers);
}

function directChild(node: SyntaxNodeLike, type: string): SyntaxNodeLike | null {
  return node.children.find((child) => child.type === type) ?? null;
}

function hasDirectToken(node: SyntaxNodeLike, type: string): boolean {
  return node.children.some((child) => child.type === type);
}

function containsToken(node: SyntaxNodeLike, type: string): boolean {
  return (
    node.type === type ||
    (node.children.length === 0 && node.text === type) ||
    node.children.some((child) => containsToken(child, type))
  );
}

const JAVA_CLASS_MEMBER_TYPES = new Set([
  "annotation_type_declaration",
  "class_declaration",
  "compact_constructor_declaration",
  "constructor_declaration",
  "enum_declaration",
  "field_declaration",
  "interface_declaration",
  "method_declaration",
  "record_declaration",
]);

const JAVA_CONTAINER_MEMBER_TYPES = new Set([
  ...JAVA_CLASS_MEMBER_TYPES,
  "constant_declaration",
  "enum_body_declarations",
  "enum_constant",
  "annotation_type_element_declaration",
]);
