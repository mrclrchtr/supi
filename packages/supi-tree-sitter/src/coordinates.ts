// Coordinate conversion between public 1-based UTF-16 positions
// and Tree-sitter runtime positions.
//
// web-tree-sitter's Parser.parse(string) uses JavaScript string columns
// (UTF-16 code unit offsets) for startPosition/endPosition. We convert
// 1-based user-facing positions to 0-based row/column and back without
// any byte-level encoding.
//
// This matches the column convention used by LSP and Monaco, so ranges
// are directly shareable between tree-sitter and LSP workflows.

import type { SourceRange } from "./types.ts";

/** Point in source: 1-based line and UTF-16 character. */
export interface PublicPoint {
  line: number;
  character: number;
}

/**
 * Convert a 1-based (line, character) pair to a 0-based (row, column) pair
 * for Tree-sitter lookup.
 *
 * `character` is a UTF-16 code-unit column (editor/LSP convention).
 * The column maps directly to JavaScript string code units — no byte
 * conversion is needed for web-tree-sitter's string-parsing mode.
 */
export function publicToTreeSitter(
  line: number,
  character: number,
  source: string,
): { row: number; column: number } {
  const row = line - 1;
  const lines = splitSourceLines(source);
  const lineText = row < lines.length ? (lines[row] ?? "") : "";
  // Clamp column to the line length.
  const column = Math.max(0, Math.min(character - 1, lineText.length));
  return { row, column };
}

/**
 * Convert a Tree-sitter (row, column) pair to a 1-based (line, character) pair.
 *
 * `column` is a zero-based JavaScript string code unit offset within the line.
 */
export function treeSitterToPublic(row: number, column: number, source: string): PublicPoint {
  // Clamp to EOL for positions right after the last character.
  const lines = splitSourceLines(source);
  const lineText = row < lines.length ? (lines[row] ?? "") : "";
  const safeColumn = Math.max(0, Math.min(column, lineText.length));
  return { line: row + 1, character: safeColumn + 1 };
}

/**
 * Convert a Tree-sitter point {row, column} to a SourceRange-compatible point.
 */
export function tsPointToPublic(
  point: { row: number; column: number },
  source: string,
): PublicPoint {
  return treeSitterToPublic(point.row, point.column, source);
}

/**
 * Convert a Tree-sitter node to a public SourceRange.
 */
export function nodeToRange(
  node: {
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  },
  source: string,
): SourceRange {
  const start = tsPointToPublic(node.startPosition, source);
  const end = tsPointToPublic(node.endPosition, source);
  return {
    startLine: start.line,
    startCharacter: start.character,
    endLine: end.line,
    endCharacter: end.character,
  };
}

/** Validate that a public position exists in the source bounds. */
export function validatePublicPositionBounds(
  line: number,
  character: number,
  source: string,
): { kind: "validation-error"; message: string } | null {
  const lines = splitSourceLines(source);
  if (line > lines.length) {
    return { kind: "validation-error", message: "line is beyond end of file" };
  }

  const lineText = lines[line - 1] ?? "";
  if (character > lineText.length + 1) {
    return { kind: "validation-error", message: "character is beyond end of line" };
  }

  return null;
}

/** Split source into logical lines without CRLF line-ending bytes. */
export function splitSourceLines(source: string): string[] {
  return source.replace(/\r\n?/g, "\n").split("\n");
}
