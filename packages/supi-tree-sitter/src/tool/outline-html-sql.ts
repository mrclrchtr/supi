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
          name: sqlStringLiteralValue(child.text),
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
  const nameNode = node.children
    .slice(marker + 1)
    .find((child) => child.type === "literal" || child.type === "identifier");
  const name = readSqlNameAfterKeyword(node.text, "CONSTRAINT");
  if (!name || !nameNode) return [];
  return [{ name, kind: "constraint", range: nodeToRange(nameNode, source) }];
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
  const textName =
    kind === "constraint"
      ? readSqlNameAfterKeyword(node.text, "CONSTRAINT")
      : readSqlIdentifier(node.text);
  const name = node.childForFieldName("name") ?? directChild(node, "identifier");
  const value = textName ?? (name ? normalizeSqlIdentifierLike(name.text) : null);
  return value ? { name: value, kind, range: nodeToRange(node, source) } : null;
}

function sqlDeclarationName(node: SyntaxNodeLike): string | null {
  const keyword = SQL_DECLARATION_KEYWORDS[node.type];
  if (keyword) {
    const name = readSqlNameAfterKeyword(node.text, keyword);
    if (name) return name;
  }

  const reference = directChild(node, "object_reference");
  if (reference) {
    const name = reference.childForFieldName("name") ?? lastDirectChild(reference, "identifier");
    if (name) return normalizeSqlIdentifierLike(name.text);
  }
  const name = directChild(node, "identifier");
  return name ? normalizeSqlIdentifierLike(name.text) : null;
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

function normalizeSqlIdentifierLike(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('""', '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return sqlStringLiteralValue(value);
  }
  return value;
}

function sqlStringLiteralValue(value: string): string {
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1).replaceAll("''", "'")
    : value;
}

function readSqlNameAfterKeyword(text: string, keyword: string): string | null {
  const marker = findSqlKeyword(text, keyword);
  if (marker < 0) return null;
  let position = skipSqlSpace(text, marker + keyword.length);
  for (const optional of ["CONCURRENTLY", "IF", "NOT", "EXISTS"]) {
    if (readSqlWord(text, position) === optional) {
      position = skipSqlSpace(text, position + optional.length);
    }
  }
  const name = readSqlQualifiedIdentifier(text, position);
  return name ? normalizeSqlIdentifierLike(name) : null;
}

function readSqlIdentifier(text: string): string | null {
  const name = readSqlQualifiedIdentifier(text, 0);
  return name ? normalizeSqlIdentifierLike(name) : null;
}

function readSqlQualifiedIdentifier(text: string, start: number): string | null {
  let position = skipSqlSpace(text, start);
  let last: string | null = null;
  while (position < text.length) {
    const token = readSqlIdentifierToken(text, position);
    if (!token) break;
    last = token.value;
    position = skipSqlSpace(text, token.end);
    if (text[position] !== ".") break;
    position = skipSqlSpace(text, position + 1);
  }
  return last;
}

function readSqlIdentifierToken(
  text: string,
  start: number,
): { value: string; end: number } | null {
  if (text[start] === '"' || text[start] === "'") {
    const quote = text[start];
    let position = start + 1;
    while (position < text.length) {
      if (text[position] !== quote) {
        position += 1;
        continue;
      }
      if (text[position + 1] === quote) {
        position += 2;
        continue;
      }
      position += 1;
      return { value: text.slice(start, position), end: position };
    }
    return null;
  }

  let position = start;
  while (position < text.length && !/[\s(;.,]/.test(text[position] ?? "")) position += 1;
  return position > start ? { value: text.slice(start, position), end: position } : null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: quoted SQL names need a small lexical scan before keyword recovery
function findSqlKeyword(text: string, keyword: string): number {
  const upper = text.toUpperCase();
  let quote: '"' | "'" | null = null;
  for (let position = 0; position < text.length; position += 1) {
    const character = text[position];
    if (quote !== null) {
      if (character === quote && text[position + 1] === quote) {
        position += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (!upper.startsWith(keyword, position)) continue;
    const before = upper[position - 1] ?? " ";
    const after = upper[position + keyword.length] ?? " ";
    if (!/[A-Z0-9_]/.test(before) && !/[A-Z0-9_]/.test(after)) return position;
  }
  return -1;
}

function readSqlWord(text: string, start: number): string | null {
  const end = text.slice(start).search(/\s/);
  const wordEnd = end < 0 ? text.length : start + end;
  return wordEnd > start ? text.slice(start, wordEnd).toUpperCase() : null;
}

function skipSqlSpace(text: string, start: number): number {
  let position = start;
  while (/\s/.test(text[position] ?? "")) position += 1;
  return position;
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

const SQL_DECLARATION_KEYWORDS: Record<string, string> = {
  create_schema: "SCHEMA",
  create_type: "TYPE",
  create_table: "TABLE",
  create_view: "VIEW",
  create_materialized_view: "VIEW",
  create_index: "INDEX",
  create_sequence: "SEQUENCE",
  create_function: "FUNCTION",
  create_trigger: "TRIGGER",
  create_database: "DATABASE",
  create_role: "ROLE",
  create_extension: "EXTENSION",
};
