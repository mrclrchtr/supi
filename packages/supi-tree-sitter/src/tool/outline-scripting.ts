import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

/** Extract Ruby, shell, and R declarations from their grammar-specific node shapes. */
export function extractScriptingOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  const ruby = rubyItems(node, "top-level", source);
  if (ruby) return ruby;

  switch (node.type) {
    case "variable_assignment":
      return isNestedShellDeclaration(node) || node.parent?.type === "command"
        ? []
        : one(shellVariable(node, "variable", source));
    case "declaration_command":
      return isNestedShellDeclaration(node) ? [] : shellDeclarations(node, source);
    case "function_definition": {
      const nameType = node.childForFieldName("name")?.type;
      if (nameType === "word") {
        return isNestedShellDeclaration(node) ? [] : one(named(node, "function", source));
      }
      return nameType === "function" || nameType === "\\" ? [] : undefined;
    }
    case "binary_operator":
      return rAssignments(node, source);
    default:
      return undefined;
  }
}

function rubyItems(
  node: SyntaxNodeLike,
  context: "top-level" | "member",
  source: string,
): OutlineItem[] | undefined {
  switch (node.type) {
    case "assignment":
    case "operator_assignment":
      return rubyAssignments(node, context, source);
    case "module":
      return isRubyContainer(node) ? one(rubyContainer(node, "module", source)) : undefined;
    case "class":
      return isRubyContainer(node) ? one(rubyContainer(node, "class", source)) : undefined;
    case "method":
      return one(named(node, context === "member" ? "method" : "function", source));
    case "singleton_method":
      return one(named(node, "method", source));
    case "singleton_class":
      return rubyMembers(node.childForFieldName("body"), source);
    case "alias":
      return one(named(node, context === "member" ? "method" : "function", source));
    case "call":
      return context === "member" ? rubyCallMethods(node, source) : undefined;
    case "block":
      return node.childForFieldName("body")?.type === "block_body" ? [] : undefined;
    case "do_block":
      return node.childForFieldName("body")?.type === "body_statement" ? [] : undefined;
    default:
      return undefined;
  }
}

function isRubyContainer(node: SyntaxNodeLike): boolean {
  const name = node.childForFieldName("name");
  const body = node.childForFieldName("body");
  return Boolean(
    name && RUBY_CONTAINER_NAME_TYPES.has(name.type) && (!body || body.type === "body_statement"),
  );
}

function rubyContainer(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  if (!name) return null;
  return {
    name: name.text,
    kind,
    range: nodeToRange(node, source),
    children: rubyMembers(node.childForFieldName("body"), source),
  };
}

function rubyMembers(body: SyntaxNodeLike | null | undefined, source: string): OutlineItem[] {
  if (!body) return [];
  return body.children.flatMap((child) => rubyItems(child, "member", source) ?? []);
}

function rubyAssignments(
  node: SyntaxNodeLike,
  context: "top-level" | "member",
  source: string,
): OutlineItem[] {
  const left = node.childForFieldName("left");
  if (!left) return [];
  const range = nodeToRange(node, source);
  const items = rubyBindingNodes(left)
    .filter((binding) => context === "top-level" || binding.type !== "identifier")
    .map((binding) => ({
      name: binding.text,
      kind:
        binding.type === "constant" || binding.type === "scope_resolution"
          ? "constant"
          : "variable",
      range,
    }));
  const right = unwrapParentheses(node.childForFieldName("right"));
  const chained =
    right?.type === "assignment" || right?.type === "operator_assignment"
      ? rubyAssignments(right, context, source)
      : [];
  return [...items, ...chained];
}

function rubyBindingNodes(node: SyntaxNodeLike): SyntaxNodeLike[] {
  if (RUBY_BINDING_TYPES.has(node.type)) return [node];
  if (!RUBY_BINDING_PATTERNS.has(node.type)) return [];
  return node.children.flatMap(rubyBindingNodes);
}

function rubyCallMethods(node: SyntaxNodeLike, source: string): OutlineItem[] | undefined {
  const method = node.childForFieldName("method")?.text;
  const argumentsNode = node.childForFieldName("arguments");
  if (!method || !argumentsNode || node.childForFieldName("receiver")) return undefined;

  if (RUBY_ATTRIBUTE_METHODS.has(method)) {
    const range = nodeToRange(node, source);
    return rubySymbolNames(argumentsNode).flatMap((name) => {
      if (method === "attr_writer") return [{ name: `${name}=`, kind: "method", range }];
      if (method === "attr_accessor") {
        return [
          { name, kind: "method", range },
          { name: `${name}=`, kind: "method", range },
        ];
      }
      return [{ name, kind: "method", range }];
    });
  }
  if (method === "alias_method") {
    const name = rubySymbolNames(argumentsNode)[0];
    return name ? [{ name, kind: "method", range: nodeToRange(node, source) }] : [];
  }
  if (RUBY_VISIBILITY_METHODS.has(method)) {
    const declaration = argumentsNode.children.find(
      (child) => child.type === "method" || child.type === "singleton_method",
    );
    return declaration ? rubyItems(declaration, "member", source) : [];
  }
  return undefined;
}

function rubySymbolNames(node: SyntaxNodeLike): string[] {
  return node.children
    .filter((child) => child.type === "simple_symbol")
    .map((child) => child.text.replace(/^:/, ""));
}

function isNestedShellDeclaration(node: SyntaxNodeLike): boolean {
  if (isBackgroundedShellNode(node)) return true;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (SHELL_SCOPE_BOUNDARIES.has(parent.type)) return true;
  }
  return false;
}

function isBackgroundedShellNode(node: SyntaxNodeLike): boolean {
  for (let current = node, parent = node.parent; parent; current = parent, parent = parent.parent) {
    const index = parent.children.findIndex((child) => sameNode(child, current));
    if (index >= 0 && parent.children[index + 1]?.type === "&") return true;
  }
  return false;
}

function sameNode(left: SyntaxNodeLike, right: SyntaxNodeLike): boolean {
  return (
    left.type === right.type &&
    left.startPosition.row === right.startPosition.row &&
    left.startPosition.column === right.startPosition.column &&
    left.endPosition.row === right.endPosition.row &&
    left.endPosition.column === right.endPosition.column
  );
}

function shellVariable(
  node: SyntaxNodeLike,
  kind: "constant" | "variable",
  source: string,
): OutlineItem | null {
  const name = node.childForFieldName("name");
  return name?.type === "variable_name"
    ? { name: name.text, kind, range: nodeToRange(node, source) }
    : null;
}

function shellDeclarations(node: SyntaxNodeLike, source: string): OutlineItem[] {
  if (node.children.some((child) => child.type === "word" && /^-[a-z]*[pf]/i.test(child.text))) {
    return [];
  }
  const constant =
    node.children.some((child) => child.type === "readonly") ||
    node.children.some((child) => child.type === "word" && /^-[a-z]*r/i.test(child.text));
  const range = nodeToRange(node, source);
  return node.children.flatMap((child) => {
    if (child.type === "variable_assignment") {
      const item = shellVariable(child, constant ? "constant" : "variable", source);
      return item ? [{ ...item, range }] : [];
    }
    return child.type === "variable_name"
      ? [{ name: child.text, kind: constant ? "constant" : "variable", range }]
      : [];
  });
}

function rAssignments(node: SyntaxNodeLike, source: string): OutlineItem[] | undefined {
  const operator = node.children.find((child) => R_ASSIGNMENT_OPERATORS.has(child.type))?.type;
  if (!operator) return undefined;

  const leftward = operator === "=" || operator.endsWith("<-");
  const receiver = node.childForFieldName(leftward ? "lhs" : "rhs");
  const value = node.childForFieldName(leftward ? "rhs" : "lhs");
  if (!receiver || !value) return [];

  const item =
    receiver.type === "identifier"
      ? [
          {
            name: receiver.text,
            kind: rAssignedValue(value)?.type === "function_definition" ? "function" : "variable",
            range: nodeToRange(node, source),
          },
        ]
      : [];
  const nestedAssignment = unwrapParentheses(value);
  const chained =
    nestedAssignment?.type === "binary_operator"
      ? (rAssignments(nestedAssignment, source) ?? [])
      : [];
  return [...item, ...chained];
}

function unwrapParentheses(node: SyntaxNodeLike | null): SyntaxNodeLike | null {
  if (node?.type === "parenthesized_expression") {
    return unwrapParentheses(node.childForFieldName("body"));
  }
  if (node?.type === "parenthesized_statements") {
    return unwrapParentheses(
      node.children.find(
        (child) => child.type === "assignment" || child.type === "operator_assignment",
      ) ?? null,
    );
  }
  return node;
}

function rAssignedValue(node: SyntaxNodeLike): SyntaxNodeLike | null {
  const assignment = unwrapParentheses(node);
  if (assignment?.type !== "binary_operator") return assignment;

  const operator = assignment.children.find((child) =>
    R_ASSIGNMENT_OPERATORS.has(child.type),
  )?.type;
  if (!operator) return assignment;
  const leftward = operator === "=" || operator.endsWith("<-");
  const value = assignment.childForFieldName(leftward ? "rhs" : "lhs");
  return value ? rAssignedValue(value) : null;
}

function one(item: OutlineItem | null): OutlineItem[] {
  return item ? [item] : [];
}

function named(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = node.childForFieldName("name");
  return name ? { name: name.text, kind, range: nodeToRange(node, source) } : null;
}

const RUBY_BINDING_TYPES = new Set([
  "constant",
  "identifier",
  "global_variable",
  "class_variable",
  "instance_variable",
  "scope_resolution",
]);
const RUBY_BINDING_PATTERNS = new Set([
  "left_assignment_list",
  "destructured_left_assignment",
  "rest_assignment",
]);
const RUBY_CONTAINER_NAME_TYPES = new Set(["constant", "scope_resolution"]);
const RUBY_ATTRIBUTE_METHODS = new Set(["attr", "attr_reader", "attr_writer", "attr_accessor"]);
const RUBY_VISIBILITY_METHODS = new Set([
  "private",
  "protected",
  "public",
  "module_function",
  "private_class_method",
  "public_class_method",
]);
const SHELL_SCOPE_BOUNDARIES = new Set([
  "command_substitution",
  "process_substitution",
  "subshell",
  "pipeline",
]);
const R_ASSIGNMENT_OPERATORS = new Set(["=", "<-", "<<-", "->", "->>"]);
