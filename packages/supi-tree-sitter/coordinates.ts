// Coordinate conversion between public 1-based UTF-16 positions
// and Tree-sitter runtime byte/row/column positions.

import type { SourceRange } from "./types.ts";

const encoder = new TextEncoder();

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
 * We convert it to a byte offset within the line by counting UTF-8 bytes.
 */
export function publicToTreeSitter(
  line: number,
  character: number,
  source: string,
): { row: number; column: number } {
  const row = line - 1;
  const lines = splitLines(source);
  const lineText = row < lines.length ? lines[row] : "";
  // character is 1-based; clamp to line length
  const charIndex = Math.max(0, Math.min(character - 1, lineText.length));
  // Convert UTF-16 code unit index to byte offset
  const textBefore = lineText.substring(0, charIndex);
  const byteOffset = encoder.encode(textBefore).length;
  return { row, column: byteOffset };
}

/**
 * Convert a Tree-sitter (row, column) pair to a 1-based (line, character) pair.
 *
 * `column` is a byte offset within the line; we convert it to a UTF-16
 * code-unit index.
 */
export function treeSitterToPublic(row: number, column: number, source: string): PublicPoint {
  const lines = splitLines(source);
  const lineText = row < lines.length ? lines[row] : "";
  // Convert byte offset to UTF-16 code unit index
  const charIndex = byteToUtf16Index(lineText, column);
  return { line: row + 1, character: charIndex + 1 };
}

/**
 * Convert a Tree-sitter point {row, column} to a SourceRange-compatible point.
 * Uses the source text for byte-to-UTF16 conversion.
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

/** Split source into lines. */
function splitLines(source: string): string[] {
  return source.split("\n");
}

/**
 * Convert a byte offset within a line to a UTF-16 code unit index.
 */
function byteToUtf16Index(line: string, byteOffset: number): number {
  let byteCount = 0;
  for (let i = 0; i < line.length; i++) {
    if (byteCount >= byteOffset) return i;
    const char = line.charCodeAt(i);
    // surrogate pair — 4 bytes in UTF-8, but 2 UTF-16 code units
    if (char >= 0xd800 && char <= 0xdbff) {
      byteCount += 4;
      i++; // skip low surrogate
    } else if (char > 0x7f) {
      // Non-ASCII: 2-3 bytes in UTF-8
      if (char <= 0x7ff) byteCount += 2;
      else byteCount += 3;
    } else {
      byteCount += 1;
    }
  }
  return line.length;
}
