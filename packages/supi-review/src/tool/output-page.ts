/** Default output page size in UTF-16 code units. */
export const DEFAULT_PAGE_CHARACTERS = 12_000;
/** Hard ceiling for a single output page. */
export const MAX_PAGE_CHARACTERS = 12_000;
/** Line-based cap for a single output page (before continuation metadata). */
export const MAX_PAGE_LINES = 2_000;

/** One page of paged tool or rendering output with an optional continuation offset. */
export interface TextPage {
  text: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
}

/** One selected 1-based line range before character paging is applied. */
export interface LineSelection {
  text: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

/** Select a bounded 1-based line range from file text. */
export function selectLineRange(text: string, startLine: number, lineCount = 200): LineSelection {
  const lines = text.split("\n");
  if (!Number.isSafeInteger(startLine) || startLine < 1 || startLine > lines.length) {
    throw new Error(`Start line must be an integer between 1 and ${lines.length}.`);
  }
  if (!Number.isSafeInteger(lineCount) || lineCount < 1 || lineCount > MAX_PAGE_LINES) {
    throw new Error(`Line count must be an integer between 1 and ${MAX_PAGE_LINES}.`);
  }
  const endLine = Math.min(lines.length, startLine + lineCount - 1);
  return {
    text: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine,
    totalLines: lines.length,
  };
}

function lineBoundedEnd(text: string, start: number, proposedEnd: number): number {
  let lines = 1;
  for (let index = start; index < proposedEnd; index++) {
    if (text[index] !== "\n") continue;
    if (lines >= MAX_PAGE_LINES - 2) return index;
    lines++;
  }
  return proposedEnd;
}

/** Page tool/output text by UTF-16 offsets while staying below Pi's line/byte envelope. */
export function pageText(text: string, offset = 0, limit = DEFAULT_PAGE_CHARACTERS): TextPage {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new Error(`Offset must be an integer between 0 and ${text.length}.`);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_CHARACTERS) {
    throw new Error(`Limit must be an integer between 1 and ${MAX_PAGE_CHARACTERS}.`);
  }
  let end = lineBoundedEnd(text, offset, Math.min(text.length, offset + limit));
  if (end < text.length && end > offset && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end--;
  const body = text.slice(offset, end) || "[no content]";
  const nextOffset = end < text.length ? end : undefined;
  const notice = nextOffset
    ? `\n\n[output paged; next offset: ${nextOffset}; total characters: ${text.length}]`
    : "";
  return {
    text: `${body}${notice}`,
    offset,
    ...(nextOffset !== undefined ? { nextOffset } : {}),
    totalCharacters: text.length,
  };
}
