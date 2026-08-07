import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

/** Extract HTML id declarations and SQL schema declarations. */
export function extractHtmlSqlOutlineItems(
  node: SyntaxNodeLike,
  source: string,
): OutlineItem[] | undefined {
  if (HTML_ELEMENT_TYPES.has(node.type)) return htmlElementItems(node, source);

  switch (node.type) {
    case "create_schema":
      return one(sqlItem(node, "schema", source, sqlSchemaChildren(node, source)));
    case "create_type":
      return one(sqlType(node, source));
    case "create_table":
      return one(sqlItem(node, "table", source, sqlColumns(node, source)));
    case "create_view":
    case "create_materialized_view":
      return one(sqlItem(node, "view", source));
    case "create_index":
      return one(sqlItem(node, "index", source));
    case "create_sequence":
      return one(sqlItem(node, "sequence", source));
    case "create_function":
      return one(sqlItem(node, "function", source));
    case "create_trigger":
      return one(sqlItem(node, "trigger", source));
    case "create_database":
      return one(sqlItem(node, "database", source));
    case "create_role":
      return one(sqlItem(node, "role", source));
    case "create_extension":
      return one(sqlItem(node, "extension", source));
    default:
      return undefined;
  }
}

function htmlElementItems(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const children = node.children.flatMap((child) =>
    HTML_ELEMENT_TYPES.has(child.type) ? htmlElementItems(child, source) : [],
  );
  const tag = node.type === "self_closing_tag" ? node : directChild(node, "start_tag");
  const id = tag && htmlId(tag);
  if (!id) return children;
  return [
    {
      name: id,
      kind: "element",
      range: nodeToRange(node, source),
      children,
    },
  ];
}

function htmlId(tag: SyntaxNodeLike): string | null {
  for (const attribute of tag.children) {
    if (attribute.type !== "attribute") continue;
    const name = directChild(attribute, "attribute_name");
    if (name?.text.toLowerCase() !== "id") continue;
    return firstDescendant(attribute, "attribute_value")?.text ?? null;
  }
  return null;
}

function firstDescendant(node: SyntaxNodeLike, type: string): SyntaxNodeLike | null {
  for (const child of node.children) {
    if (child.type === type) return child;
    const nested = firstDescendant(child, type);
    if (nested) return nested;
  }
  return null;
}

function sqlType(node: SyntaxNodeLike, source: string): OutlineItem | null {
  const enumElements = directChild(node, "enum_elements");
  const children = enumElements
    ? enumElements.children
        .filter((child) => child.type === "literal")
        .map((child) => ({
          name: stripSqlQuotes(child.text),
          kind: "enum-member",
          range: nodeToRange(child, source),
        }))
    : sqlColumns(node, source);
  return sqlItem(node, enumElements ? "enum" : "type", source, children);
}

function sqlColumns(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const definitions = node.children.flatMap((child) => {
    if (child.type === "column_definitions") return [child];
    if (child.type !== "table_partition") return [];
    return child.children.filter((nested) => nested.type === "column_definitions");
  });
  return definitions.flatMap((group) =>
    group.children.flatMap((child) => {
      if (child.type === "column_definition") {
        return [...one(sqlMember(child, "field", source)), ...sqlInlineConstraints(child, source)];
      }
      if (child.type === "constraints") {
        return child.children.flatMap((constraint) =>
          constraint.type === "constraint" ? one(sqlMember(constraint, "constraint", source)) : [],
        );
      }
      return [];
    }),
  );
}

function sqlInlineConstraints(node: SyntaxNodeLike, source: string): OutlineItem[] {
  const marker = node.children.findIndex((child) => child.type === "keyword_constraint");
  if (marker < 0) return [];
  const name = node.children.slice(marker + 1).find((child) => child.type === "literal");
  return name
    ? [{ name: stripSqlQuotes(name.text), kind: "constraint", range: nodeToRange(name, source) }]
    : [];
}

function sqlSchemaChildren(node: SyntaxNodeLike, source: string): OutlineItem[] {
  return node.children.flatMap((child) => extractHtmlSqlOutlineItems(child, source) ?? []);
}

function sqlItem(
  node: SyntaxNodeLike,
  kind: string,
  source: string,
  children?: OutlineItem[],
): OutlineItem | null {
  const name = sqlDeclarationName(node);
  if (!name) return null;
  return {
    name,
    kind,
    range: nodeToRange(node, source),
    ...(children ? { children } : {}),
  };
}

function sqlMember(node: SyntaxNodeLike, kind: string, source: string): OutlineItem | null {
  const name = node.childForFieldName("name") ?? directChild(node, "identifier");
  return name ? { name: stripSqlQuotes(name.text), kind, range: nodeToRange(node, source) } : null;
}

function sqlDeclarationName(node: SyntaxNodeLike): string | null {
  if (node.type === "create_index") {
    const indexName = node.childForFieldName("column");
    return indexName ? stripSqlQuotes(indexName.text) : null;
  }
  const reference = directChild(node, "object_reference");
  if (reference) {
    const name = reference.childForFieldName("name") ?? lastDirectChild(reference, "identifier");
    if (name) return name.text;
  }
  return directChild(node, "identifier")?.text ?? null;
}

function directChild(node: SyntaxNodeLike, type: string): SyntaxNodeLike | null {
  return node.children.find((child) => child.type === type) ?? null;
}

function lastDirectChild(node: SyntaxNodeLike, type: string): SyntaxNodeLike | null {
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index];
    if (child?.type === type) return child;
  }
  return null;
}

function stripSqlQuotes(value: string): string {
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1).replaceAll("''", "'")
    : value;
}

function one(item: OutlineItem | null): OutlineItem[] {
  return item ? [item] : [];
}

const HTML_ELEMENT_TYPES = new Set([
  "element",
  "script_element",
  "self_closing_tag",
  "style_element",
]);
