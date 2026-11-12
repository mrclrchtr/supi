/**
 * Readable preview entries for refactor plans.
 *
 * Some servers (kotlin-lsp) return minimal character-level edits, so renaming
 * `total` to `sumDoubled` arrives as `sumD`, `ub`, `ed`. The preview combines
 * consecutive single-line edits on one line into one before/after entry. The
 * stored plan and its edits stay exactly as the server returned them.
 */

import { readFileSync } from "node:fs";
import type { FileEdit } from "@mrclrchtr/supi-code-runtime/api";

/** One preview entry: a server edit as is, or several edits on one line combined. */
export type RefactorPreviewEntry =
  | { readonly kind: "edit"; readonly edit: FileEdit }
  | {
      readonly kind: "line";
      readonly file: string;
      /** Zero-based line and UTF-16 span covering every combined edit. */
      readonly line: number;
      readonly startCharacter: number;
      readonly endCharacter: number;
      readonly before: string;
      readonly after: string;
      readonly editCount: number;
    };

/**
 * Number of leading edits to show so that at least `maxResults` are shown and
 * the last shown edit does not split a group of edits on the same line.
 */
export function previewEditCount(edits: readonly FileEdit[], maxResults: number): number {
  let count = Math.min(Math.max(0, maxResults), edits.length);
  while (count > 0 && count < edits.length) {
    const last = edits[count - 1] as FileEdit;
    const next = edits[count] as FileEdit;
    if (!isInlineEdit(last) || !isInlineEdit(next) || !sameLine(last, next)) break;
    count++;
  }
  return count;
}

/** Combine consecutive edits on one line when the current file text allows it. */
export function buildRefactorPreview(edits: readonly FileEdit[]): RefactorPreviewEntry[] {
  const lines = new Map<string, readonly string[] | null>();
  const entries: RefactorPreviewEntry[] = [];
  for (let index = 0; index < edits.length; ) {
    let end = index + 1;
    const first = edits[index] as FileEdit;
    while (
      end < edits.length &&
      isInlineEdit(first) &&
      isInlineEdit(edits[end] as FileEdit) &&
      sameLine(first, edits[end] as FileEdit)
    ) {
      end++;
    }
    const group = edits.slice(index, end);
    const combined = group.length > 1 ? combineLine(group, fileLines(first.file, lines)) : null;
    if (combined) entries.push(combined);
    else entries.push(...group.map((edit) => ({ kind: "edit" as const, edit })));
    index = end;
  }
  return entries;
}

function isInlineEdit(edit: FileEdit): boolean {
  return edit.range.start.line === edit.range.end.line && !/[\r\n]/u.test(edit.newText);
}

function sameLine(a: FileEdit, b: FileEdit): boolean {
  return a.file === b.file && a.range.start.line === b.range.start.line;
}

function fileLines(
  file: string,
  cache: Map<string, readonly string[] | null>,
): readonly string[] | null {
  if (!cache.has(file)) {
    try {
      cache.set(file, readFileSync(file, "utf8").split(/\r\n|\r|\n/u));
    } catch {
      cache.set(file, null);
    }
  }
  return cache.get(file) ?? null;
}

/** Apply sorted, non-overlapping edits to their line; null when that is not possible. */
function combineLine(
  group: readonly FileEdit[],
  lines: readonly string[] | null,
): RefactorPreviewEntry | null {
  const first = group[0] as FileEdit;
  const text = lines?.[first.range.start.line];
  if (text === undefined) return null;
  const sorted = [...group].sort((a, b) => a.range.start.character - b.range.start.character);
  let after = "";
  let cursor = (sorted[0] as FileEdit).range.start.character;
  const startCharacter = cursor;
  for (const edit of sorted) {
    const { start, end } = edit.range;
    if (start.character < cursor || end.character < start.character) return null;
    if (end.character > text.length) return null;
    after += text.slice(cursor, start.character) + edit.newText;
    cursor = end.character;
  }
  return {
    kind: "line",
    file: first.file,
    line: first.range.start.line,
    startCharacter,
    endCharacter: cursor,
    before: text.slice(startCharacter, cursor),
    after,
    editCount: group.length,
  };
}
