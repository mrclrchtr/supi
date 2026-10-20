// Nested declaration expansion and native-kind metadata for selected grammars.

import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { GrammarId, OutlineItem } from "../types.ts";

type NestedOutlineOptions = {
  readonly items: OutlineItem[];
  readonly node: SyntaxNodeLike;
  readonly source: string;
  readonly lineStarts: readonly number[];
  readonly grammarId?: GrammarId;
  readonly extractItemsForNode: (node: SyntaxNodeLike) => OutlineItem[] | null;
};

/** Add named nested declarations while preserving the current shallow outline contract. */
export function expandNestedItems(options: NestedOutlineOptions): OutlineItem[] {
  const { items, node, source, lineStarts, grammarId } = options;
  if (!grammarId || !EXPANDED_OUTLINE_GRAMMARS.has(grammarId)) return items;
  return items.map((item) => {
    const nativeKind = item.nativeKind ?? nativeDeclarationKind(item, node, grammarId);
    const nested = NESTED_SCOPE_OWNER_TYPES[grammarId]?.has(node.type)
      ? collectNestedDeclarations({
          owner: node,
          source,
          lineStarts,
          grammarId,
          extractItemsForNode: options.extractItemsForNode,
        })
      : [];
    const children = mergeOutlineChildren(item.children ?? [], nested).map(addDefaultNativeKind);
    return {
      ...item,
      nativeKind,
      ...(children.length > 0 ? { children } : {}),
    };
  });
}

function collectNestedDeclarations(options: {
  readonly owner: SyntaxNodeLike;
  readonly source: string;
  readonly lineStarts: readonly number[];
  readonly grammarId: GrammarId;
  readonly extractItemsForNode: (node: SyntaxNodeLike) => OutlineItem[] | null;
}): OutlineItem[] {
  const { owner, source, lineStarts, grammarId, extractItemsForNode } = options;
  const result: OutlineItem[] = [];
  const visit = (node: SyntaxNodeLike): void => {
    for (const child of node.children) {
      if (isNestedDeclaration(child, owner, grammarId)) {
        const items = extractItemsForNode(child);
        const namedItems = (items ?? []).filter(
          (item) => item.name.length > 0 && item.name !== "<anonymous>",
        );
        if (namedItems.length > 0) {
          result.push(
            ...expandNestedItems({
              items: namedItems,
              node: child,
              source,
              lineStarts,
              grammarId,
              extractItemsForNode,
            }),
          );
          continue;
        }
      }
      visit(child);
    }
  };
  visit(owner);
  return result;
}

function isNestedDeclaration(
  node: SyntaxNodeLike,
  owner: SyntaxNodeLike,
  grammarId: GrammarId,
): boolean {
  const allowed = NESTED_DECLARATION_TYPES[grammarId];
  if (!allowed?.has(node.type)) return false;
  if (grammarId === "java" && node.type === "field_declaration") {
    return isJavaAnonymousClassField(node, owner);
  }
  if (node.type === "declaration" && (grammarId === "c" || grammarId === "cpp")) {
    let parent = node.parent;
    while (parent && parent !== owner) {
      if (
        [
          "field_declaration_list",
          "field_declaration_list_item",
          "class_specifier",
          "struct_specifier",
          "union_specifier",
        ].includes(parent.type)
      ) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }
  return true;
}

/** Named class fields are already in the shallow outline; add only anonymous-class fields here. */
function isJavaAnonymousClassField(node: SyntaxNodeLike, owner: SyntaxNodeLike): boolean {
  let parent = node.parent;
  while (parent && parent !== owner) {
    if (parent.type === "class_body") {
      const container = parent.parent?.type;
      return container === "object_creation_expression" || container === "enum_constant";
    }
    parent = parent.parent;
  }
  return false;
}

function mergeOutlineChildren(
  existing: readonly OutlineItem[],
  nested: readonly OutlineItem[],
): OutlineItem[] {
  const merged = [...existing];
  for (const item of nested) {
    const index = merged.findIndex((entry) => sameOutlineSource(entry, item));
    if (index < 0) merged.push(item);
    else {
      const previous = merged[index];
      merged[index] = {
        ...previous,
        nativeKind: item.nativeKind ?? previous.nativeKind,
        ...(item.children?.length
          ? { children: mergeOutlineChildren(previous.children ?? [], item.children) }
          : {}),
      };
    }
  }
  return merged.sort(
    (left, right) =>
      left.range.startLine - right.range.startLine ||
      left.range.startCharacter - right.range.startCharacter,
  );
}

function addDefaultNativeKind(item: OutlineItem): OutlineItem {
  return {
    ...item,
    nativeKind: item.nativeKind ?? item.kind,
    ...(item.children ? { children: item.children.map(addDefaultNativeKind) } : {}),
  };
}

function sameOutlineSource(left: OutlineItem, right: OutlineItem): boolean {
  return (
    left.name === right.name &&
    left.range.startLine === right.range.startLine &&
    left.range.startCharacter === right.range.startCharacter &&
    left.range.endLine === right.range.endLine &&
    left.range.endCharacter === right.range.endCharacter
  );
}

function nativeDeclarationKind(
  item: OutlineItem,
  node: SyntaxNodeLike,
  grammarId: GrammarId,
): string {
  if (grammarId === "rust" && node.type === "trait_item") return "trait";
  if (grammarId === "java" && node.type === "record_declaration") return "record";
  if (grammarId === "go" && node.type === "type_spec") {
    const definition = node.childForFieldName("type");
    if (definition?.type === "struct_type") return "struct";
    if (definition?.type === "interface_type") return "interface";
  }
  const nativeKinds: Readonly<Record<string, string>> = {
    function_definition: "function",
    function_declaration: "function",
    function_item: "function",
    class_declaration: "class",
    class_definition: "class",
    class_specifier: "class",
    struct_item: "struct",
    struct_specifier: "struct",
    union_item: "union",
    union_specifier: "union",
    enum_item: "enum",
    enum_specifier: "enum",
    interface_declaration: "interface",
    method_declaration: "method",
    method_definition: "method",
    constructor_declaration: "constructor",
    type_alias: "type alias",
    type_item: "type alias",
    type_alias_declaration: "type alias",
    alias_declaration: "type alias",
    type_definition: "typedef",
  };
  return nativeKinds[node.type] ?? item.kind;
}

const EXPANDED_OUTLINE_GRAMMARS: ReadonlySet<GrammarId> = new Set([
  "javascript",
  "typescript",
  "tsx",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
]);

const NESTED_SCOPE_OWNER_TYPES: Partial<Record<GrammarId, ReadonlySet<string>>> = {
  javascript: new Set([
    "field_definition",
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "generator_function",
    "arrow_function",
    "class_declaration",
    "abstract_class_declaration",
    "class_expression",
    "method_definition",
    "interface_declaration",
    "enum_declaration",
    "internal_module",
    "module",
    "variable_declarator",
  ]),
  typescript: new Set([
    "public_field_definition",
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "generator_function",
    "arrow_function",
    "class_declaration",
    "abstract_class_declaration",
    "class_expression",
    "method_definition",
    "interface_declaration",
    "enum_declaration",
    "internal_module",
    "module",
    "variable_declarator",
  ]),
  tsx: new Set([
    "public_field_definition",
    "function_declaration",
    "generator_function_declaration",
    "function_expression",
    "generator_function",
    "arrow_function",
    "class_declaration",
    "abstract_class_declaration",
    "class_expression",
    "method_definition",
    "interface_declaration",
    "enum_declaration",
    "internal_module",
    "module",
    "variable_declarator",
  ]),
  python: new Set(["function_definition", "class_definition"]),
  java: new Set([
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "annotation_type_declaration",
    "method_declaration",
    "constructor_declaration",
  ]),
  go: new Set(["function_declaration", "method_declaration", "type_spec"]),
  rust: new Set([
    "function_item",
    "struct_item",
    "union_item",
    "enum_item",
    "trait_item",
    "impl_item",
    "mod_item",
  ]),
  c: new Set([
    "function_definition",
    "class_specifier",
    "struct_specifier",
    "union_specifier",
    "enum_specifier",
  ]),
  cpp: new Set([
    "function_definition",
    "class_specifier",
    "struct_specifier",
    "union_specifier",
    "enum_specifier",
    "namespace_definition",
  ]),
};

const NESTED_DECLARATION_TYPES: Partial<Record<GrammarId, ReadonlySet<string>>> = {
  javascript: new Set([
    "field_definition",
    "function_declaration",
    "generator_function_declaration",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "method_definition",
    "public_field_definition",
    "function_signature",
    "internal_module",
    "module",
  ]),
  typescript: new Set([
    "function_declaration",
    "generator_function_declaration",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "method_definition",
    "public_field_definition",
    "function_signature",
    "internal_module",
    "module",
  ]),
  tsx: new Set([
    "function_declaration",
    "generator_function_declaration",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "method_definition",
    "public_field_definition",
    "function_signature",
    "internal_module",
    "module",
  ]),
  python: new Set(["function_definition", "class_definition"]),
  java: new Set([
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "annotation_type_declaration",
    "method_declaration",
    "constructor_declaration",
    "field_declaration",
  ]),
  go: new Set(["function_declaration", "method_declaration", "type_spec", "type_alias"]),
  rust: new Set([
    "function_item",
    "struct_item",
    "union_item",
    "enum_item",
    "trait_item",
    "impl_item",
    "const_item",
    "static_item",
    "type_item",
    "mod_item",
  ]),
  c: new Set([
    "function_definition",
    "class_specifier",
    "struct_specifier",
    "union_specifier",
    "enum_specifier",
    "type_definition",
  ]),
  cpp: new Set([
    "function_definition",
    "class_specifier",
    "struct_specifier",
    "union_specifier",
    "enum_specifier",
    "type_definition",
    "alias_declaration",
    "concept_definition",
    "namespace_definition",
  ]),
};
