import { nodeToRange } from "../coordinates.ts";
import type { SyntaxNodeLike } from "../syntax-node.ts";
import type { OutlineItem } from "../types.ts";

const UNSUPPORTED_TITLE_CHARACTERS = /[\\{}%$#&^~_[\]()=]/u;

const LATEX_SECTION_KINDS: Readonly<Record<string, string>> = {
  part: "part",
  chapter: "chapter",
  section: "section",
  subsection: "subsection",
  subsubsection: "subsubsection",
  paragraph: "paragraph",
  subparagraph: "subparagraph",
};

const LATEX_DEFINITION_FIELDS: Readonly<Record<string, { field: string; kind: string }>> = {
  new_command_definition: { field: "declaration", kind: "command" },
  old_command_definition: { field: "declaration", kind: "command" },
  let_command_definition: { field: "declaration", kind: "command" },
  paired_delimiter_definition: { field: "declaration", kind: "command" },
  environment_definition: { field: "name", kind: "environment" },
  label_definition: { field: "name", kind: "label" },
  acronym_definition: { field: "name", kind: "acronym" },
  glossary_entry_definition: { field: "name", kind: "glossary-entry" },
  color_definition: { field: "name", kind: "color" },
};

/** Extract LaTeX section headings and explicit definitions from grammar nodes. */
export function extractLatexOutlineItems(
  node: SyntaxNodeLike,
  source: string,
  lineStarts: readonly number[],
): OutlineItem[] | undefined {
  const sectionKind = LATEX_SECTION_KINDS[node.type];
  if (sectionKind) return extractLatexSectionItem(node, source, lineStarts, sectionKind);

  const definition = LATEX_DEFINITION_FIELDS[node.type];
  if (!definition) return undefined;
  const declaration = node.childForFieldName(definition.field);
  const label = definition.kind === "label" ? extractLatexLabel(node, source, lineStarts) : null;
  const name =
    definition.kind === "label"
      ? (label?.name ?? "")
      : declaration
        ? groupContent(declaration.text)
        : "";
  if (!name) return [];
  return [
    {
      name,
      kind: definition.kind,
      range: nodeToRange(node, source),
      ...(label ? { nameAnchor: label.nameAnchor } : {}),
    },
  ];
}

function extractLatexSectionItem(
  node: SyntaxNodeLike,
  source: string,
  lineStarts: readonly number[],
  sectionKind: string,
): OutlineItem[] {
  const title = node.childForFieldName("text");
  const name = title ? groupContent(title.text) : "";
  if (!name) return [];
  const titleSpan = title ? findPlainTitleSpan(title, source, lineStarts, name) : null;
  return [
    {
      name,
      kind: sectionKind,
      range: nodeToRange(node, source),
      ...(titleSpan ? { nameAnchor: titleSpan.start, nameEndAnchor: titleSpan.end } : {}),
      children: collectLatexMembers(node, source, lineStarts),
    },
  ];
}

/** Read only label keys with one source-contiguous name span. */
function extractLatexLabel(
  node: SyntaxNodeLike,
  source: string,
  lineStarts: readonly number[],
): { name: string; nameAnchor: { line: number; character: number } } | null {
  const commandStart = sourceOffsetAt(
    source,
    node.startPosition.row,
    node.startPosition.column,
    lineStarts,
  );
  const group = findLatexLabelGroup(source, commandStart);
  if (!group) return null;
  const key = findContiguousLabelKey(source, group.openBrace, group.closeBrace);
  if (!key) return null;
  const prefixLines = source.slice(commandStart, key.start).split(/\r\n|\r|\n/u);
  const lastPrefix = prefixLines[prefixLines.length - 1] ?? "";
  return {
    name: source.slice(key.start, key.end),
    nameAnchor: {
      line: node.startPosition.row + prefixLines.length,
      character:
        prefixLines.length === 1
          ? node.startPosition.column + lastPrefix.length + 1
          : lastPrefix.length + 1,
    },
  };
}

function findLatexLabelGroup(
  source: string,
  commandStart: number,
): { openBrace: number; closeBrace: number } | null {
  if (!source.startsWith("\\label", commandStart)) return null;
  const openBrace = skipLabelTrivia(source, commandStart + "\\label".length, source.length);
  if (source[openBrace] !== "{") return null;
  const closeBrace = findLabelGroupEnd(source, openBrace);
  return closeBrace < 0 ? null : { openBrace, closeBrace };
}

function findContiguousLabelKey(
  source: string,
  openBrace: number,
  closeBrace: number,
): { start: number; end: number } | null {
  const start = skipLabelTrivia(source, openBrace + 1, closeBrace);
  if (start >= closeBrace || isLabelGroupBrace(source, start)) return null;
  let end = start;
  while (end < closeBrace && !isLabelKeyBoundary(source, end)) end += 1;
  return skipLabelTrivia(source, end, closeBrace) === closeBrace ? { start, end } : null;
}

function skipLabelTrivia(source: string, start: number, end: number): number {
  let cursor = start;
  while (cursor < end) {
    if (isTexCommentStart(source, cursor)) {
      cursor = skipTexComment(source, cursor, end);
      continue;
    }
    const character = source[cursor];
    if (character !== undefined && /\s/u.test(character)) {
      cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}

function isLabelKeyBoundary(source: string, index: number): boolean {
  const character = source[index];
  return (
    character === undefined ||
    isTexCommentStart(source, index) ||
    (character !== undefined && /\s/u.test(character)) ||
    (isLabelGroupBrace(source, index) && !isEscaped(source, index))
  );
}

function isLabelGroupBrace(source: string, index: number): boolean {
  return source[index] === "{" || source[index] === "}";
}

function findLabelGroupEnd(text: string, openBrace: number): number {
  let depth = 1;
  for (let index = openBrace + 1; index < text.length; index += 1) {
    if (isTexCommentStart(text, index)) {
      index = skipTexComment(text, index, text.length) - 1;
      continue;
    }
    if (isEscaped(text, index)) continue;
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function sourceOffsetAt(
  source: string,
  row: number,
  column: number,
  lineStarts: readonly number[],
): number {
  return Math.min(source.length, (lineStarts[row] ?? source.length) + column);
}

function isTexCommentStart(text: string, index: number): boolean {
  return text[index] === "%" && !isEscaped(text, index);
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function skipTexComment(text: string, start: number, end: number): number {
  const newline = text.indexOf("\n", start);
  const carriageReturn = text.indexOf("\r", start);
  const lineEnd =
    newline < 0 ? carriageReturn : carriageReturn < 0 ? newline : Math.min(newline, carriageReturn);
  if (lineEnd < 0 || lineEnd >= end) return end;
  return lineEnd + (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n" ? 2 : 1);
}

function collectLatexMembers(
  node: SyntaxNodeLike,
  source: string,
  lineStarts: readonly number[],
): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const child of node.children) {
    const sectionKind = LATEX_SECTION_KINDS[child.type];
    if (sectionKind) {
      items.push(...(extractLatexOutlineItems(child, source, lineStarts) ?? []));
      continue;
    }

    const definition = LATEX_DEFINITION_FIELDS[child.type];
    if (definition) {
      items.push(...(extractLatexOutlineItems(child, source, lineStarts) ?? []));
      continue;
    }
    items.push(...collectLatexMembers(child, source, lineStarts));
  }
  return items;
}

function findPlainTitleSpan(
  node: SyntaxNodeLike,
  source: string,
  lineStarts: readonly number[],
  name: string,
): { start: { line: number; character: number }; end: { line: number; character: number } } | null {
  const groupStart = sourceOffsetAt(
    source,
    node.startPosition.row,
    node.startPosition.column,
    lineStarts,
  );
  const groupEnd = sourceOffsetAt(
    source,
    node.endPosition.row,
    node.endPosition.column,
    lineStarts,
  );
  if (source[groupStart] !== "{" || source[groupEnd - 1] !== "}") return null;

  const rawText = source.slice(groupStart + 1, groupEnd - 1);
  const text = rawText.trim();
  if (!text || normalizeTitleWhitespace(text) !== name || UNSUPPORTED_TITLE_CHARACTERS.test(text)) {
    return null;
  }
  const startOffset = groupStart + 1 + (rawText.length - rawText.trimStart().length);
  const endOffset = startOffset + text.length;
  if (source.slice(startOffset, endOffset) !== text) return null;
  return {
    start: sourcePointAtOffset(startOffset, lineStarts),
    end: sourcePointAtOffset(endOffset, lineStarts),
  };
}

function sourcePointAtOffset(
  offset: number,
  lineStarts: readonly number[],
): { line: number; character: number } {
  let lineIndex = 0;
  while (lineIndex + 1 < lineStarts.length && (lineStarts[lineIndex + 1] ?? Infinity) <= offset) {
    lineIndex += 1;
  }
  return { line: lineIndex + 1, character: offset - (lineStarts[lineIndex] ?? 0) + 1 };
}

function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function groupContent(value: string): string {
  const trimmed = value.trim();
  const contents =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  return contents.replace(/\s+/g, " ").trim();
}
