import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

/** Extract declarations whose Tree-sitter node shapes are specific to Python, Rust, or Go. */
export function extractPolyglotOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  switch (node.type) {
    case "function_definition":
      return one(named(node, "function", source));
    case "class_definition":
      return one(container(node, "class", source, pythonMethods));
    case "expression_statement":
      return pythonAssignments(node, source);
    case "function_item":
      return one(named(node, "function", source));
    case "struct_item":
      return one(container(node, "struct", source, rustFields));
    case "union_item":
      return one(container(node, "union", source, rustFields));
    case "enum_item":
      return one(container(node, "enum", source, rustEnumVariants));
    case "trait_item":
      return one(container(node, "interface", source, rustMethods));
    case "impl_item":
      return one(rustImplementation(node, source));
    case "const_item":
      return one(named(node, "constant", source));
    case "static_item":
      return one(named(node, "variable", source));
    case "type_item":
      return one(named(node, "type", source));
    case "mod_item":
      return one(named(node, "module", source));
    case "method_declaration":
      return one(named(node, "method", source));
    case "type_spec":
      return one(goType(node, source));
    case "type_alias":
      return one(named(node, "type", source));
    case "const_spec":
      return namedItems(node, "constant", source);
    case "var_spec":
      return namedItems(node, "variable", source);
    default:
      return undefined;
  }
}

function one(item: OutlineItem | null): OutlineItem[] {
  return item ? [item] : [];
}

function named(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = findName(node);
  return name ? { name: name.text, kind, range: nodeToRange(node, source) } : null;
}

function container(
  node: SyntaxNodeLike,
  kind: string,
  source: string,
  collectChildren: (node: SyntaxNodeLike, source: string) => OutlineItem[],
): OutlineItem | null {
  const name = findName(node);
  if (!name) return null;
  return {
    name: name.text,
    kind,
    range: nodeToRange(node, source),
    children: collectChildren(node, source),
  };
}

function pythonAssignments(node: SyntaxNodeLike, source: string): OutlineItem[] | undefined {
  const assignment = node.children.find((child) => child.type === "assignment");
  return assignment ? collectPythonAssignment(assignment, source) : undefined;
}

function collectPythonAssignment(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const items = pythonBindingItems(node.childForFieldName("left"), node, source);
  const right = node.childForFieldName("right");
  if (right?.type === "assignment") items.push(...collectPythonAssignment(right, source));
  return items;
}

function pythonBindingItems(
  target: SyntaxNodeLike | null,
  declaration: SyntaxNodeLike,
  source: string,
): OutlineItem[] {
  if (!target) return [];
  if (target.type === "identifier") {
    return [{ name: target.text, kind: "variable", range: nodeToRange(declaration, source) }];
  }
  if (!PYTHON_BINDING_PATTERNS.has(target.type)) return [];
  return target.children.flatMap((child) => pythonBindingItems(child, declaration, source));
}

const PYTHON_BINDING_PATTERNS = new Set(["pattern_list", "list_pattern", "tuple_pattern"]);

function pythonMethods(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  if (!body) return [];
  return body.children.flatMap((child) => {
    const declaration =
      child.type === "decorated_definition"
        ? child.children.find((nested) => nested.type === "function_definition")
        : child;
    if (declaration?.type !== "function_definition") return [];
    const item = named(declaration, "method", source);
    return item ? [item] : [];
  });
}

function rustFields(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  return collectNamedChildren(body, new Set(["field_declaration"]), "field", source);
}

function rustEnumVariants(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  return collectNamedChildren(body, new Set(["enum_variant"]), "enum-member", source);
}

function rustMethods(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("body");
  return collectNamedChildren(
    body,
    new Set(["function_item", "function_signature_item"]),
    "method",
    source,
  );
}

function rustImplementation(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const type = node.childForFieldName("type");
  if (!type) return null;
  const trait = node.childForFieldName("trait");
  return {
    name: trait ? `${trait.text} for ${type.text}` : type.text,
    kind: "implementation",
    range: nodeToRange(node, source),
    children: rustMethods(node, source),
  };
}

function goType(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const type = node.childForFieldName("type");
  if (!type) return named(node, "type", source);
  if (type.type === "struct_type") return container(node, "struct", source, goStructFields);
  if (type.type === "interface_type") return container(node, "interface", source, goMethods);
  return named(node, "type", source);
}

function goStructFields(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node
    .childForFieldName("type")
    ?.children.find((child) => child.type.endsWith("list"));
  if (!body) return [];
  return body.children.flatMap((child) =>
    child.type === "field_declaration" ? namedItems(child, "field", source) : [],
  );
}

function goMethods(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const body = node.childForFieldName("type");
  return collectNamedChildren(body, new Set(["method_elem"]), "method", source);
}

function collectNamedChildren(
  parent: SyntaxNodeLike | null | undefined,
  accepted: ReadonlySet<string>,
  kind: string,
  source: string,
): OutlineItem[] {
  if (!parent) return [];
  return parent.children.flatMap((child) => {
    if (!accepted.has(child.type)) return [];
    const item = named(child, kind, source);
    return item ? [item] : [];
  });
}

function namedItems(node: SyntaxNodeLike, kind: string, source: string): OutlineItem[] {
  const names = node
    .childrenForFieldName("name")
    .filter((child) => NAME_NODE_TYPES.has(child.type));
  if (names.length === 0) return one(named(node, kind, source));
  const range = nodeToRange(node, source);
  return names.map((name) => ({ name: name.text, kind, range }));
}

const NAME_NODE_TYPES = new Set(["identifier", "type_identifier", "field_identifier"]);

function findName(node: SyntaxNodeLike): SyntaxNodeLike | null {
  return (
    node.childForFieldName("name") ??
    node.children.find((child) => NAME_NODE_TYPES.has(child.type)) ??
    null
  );
}
