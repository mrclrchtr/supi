import type { SyntaxNodeLike } from "../syntax-node.ts";
import { extractBindingIdentifiers } from "./js-binding-pattern.ts";

/** Return the declared name for one executable syntax scope. */
export function extractScopeName(node: SyntaxNodeLike): string {
  const declaredName = findDeclaredName(node);
  if (declaredName) return declaredName;

  if (node.type === "arrow_function" || node.type === "function_expression") {
    const binding = findNearestJavaScriptBinding(node);
    if (binding) return binding;
  }

  if (node.type === "function_definition") {
    const binding = findNearestRBinding(node);
    if (binding) return binding;
  }

  return "anonymous";
}

function findDeclaredName(node: SyntaxNodeLike): string | null {
  const name = node.childForFieldName("name");
  if (name && isNameNode(name)) return name.text;

  const declarator = node.childForFieldName("declarator");
  return declarator ? findDeclaratorName(declarator) : null;
}

function findDeclaratorName(node: SyntaxNodeLike): string | null {
  const namedChild = node.childForFieldName("name");
  if (namedChild && isNameNode(namedChild)) return namedChild.text;
  if (isNameNode(node)) return node.text;
  const nested = node.childForFieldName("declarator");
  if (nested) {
    const name = findDeclaratorName(nested);
    if (name) return name;
  }
  for (const child of node.children) {
    const name = findDeclaratorName(child);
    if (name) return name;
  }
  return null;
}

function findNearestJavaScriptBinding(node: SyntaxNodeLike): string | null {
  for (let current = node.parent; current; current = current.parent) {
    const binding = bindingForJavaScriptAncestor(current, node);
    if (binding) return binding;
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: binding lookup covers the grammar's distinct assignment and object-pattern forms
function bindingForJavaScriptAncestor(node: SyntaxNodeLike, target: SyntaxNodeLike): string | null {
  if (node.type === "variable_declarator") {
    return isDirectValue(node, target)
      ? (extractBindingIdentifiers(node.childForFieldName("name"))[0] ?? null)
      : null;
  }
  if (node.type === "pair_pattern") {
    return isDirectValue(node, target)
      ? (extractBindingIdentifiers(node.childForFieldName("value"))[0] ??
          node.childForFieldName("key")?.text ??
          null)
      : null;
  }
  if (node.type === "pair") {
    return isDirectValue(node, target) ? (node.childForFieldName("key")?.text ?? null) : null;
  }
  if (node.type === "assignment_expression") {
    const right = node.childForFieldName("right");
    if (!sameNode(right, target)) return null;
    const left = node.childForFieldName("left");
    return left
      ? (extractBindingIdentifiers(left)[0] ??
          (left.type === "member_expression" || left.type === "subscript_expression"
            ? left.text
            : null))
      : null;
  }
  if (node.type === "public_field_definition") {
    return isDirectValue(node, target)
      ? ((node.childForFieldName("name") ?? node.childForFieldName("key"))?.text ?? null)
      : null;
  }
  return null;
}

function isDirectValue(node: SyntaxNodeLike, target: SyntaxNodeLike): boolean {
  return sameNode(node.childForFieldName("value"), target);
}

function findNearestRBinding(node: SyntaxNodeLike): string | null {
  for (let current = node.parent; current; current = current.parent) {
    const binding = bindingForRAncestor(current, node);
    if (binding) return binding;
  }
  return null;
}

function bindingForRAncestor(node: SyntaxNodeLike, target: SyntaxNodeLike): string | null {
  if (node.type !== "binary_operator") return null;
  const right = node.childForFieldName("rhs") ?? node.childForFieldName("right");
  const left = node.childForFieldName("lhs") ?? node.childForFieldName("left");
  return right && left && sameNode(right, target) && left.type === "identifier" ? left.text : null;
}

function sameNode(left: SyntaxNodeLike | null, right: SyntaxNodeLike): boolean {
  if (!left) return false;
  return (
    left.type === right.type &&
    left.startPosition.row === right.startPosition.row &&
    left.startPosition.column === right.startPosition.column &&
    left.endPosition.row === right.endPosition.row &&
    left.endPosition.column === right.endPosition.column
  );
}

const NAME_NODE_TYPES = new Set([
  "identifier",
  "type_identifier",
  "field_identifier",
  "property_identifier",
  "private_property_identifier",
  "simple_identifier",
  "word",
  "constant",
  "scope_resolution",
  "qualified_identifier",
  "template_function",
  "operator_name",
  "destructor_name",
]);

function isNameNode(node: SyntaxNodeLike): boolean {
  return NAME_NODE_TYPES.has(node.type);
}
