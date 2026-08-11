import type { CodePosition } from "@mrclrchtr/supi-code-runtime/api";

interface IndexedLine {
  readonly startOffset: number;
  readonly length: number;
}

/** Logical source lines with offsets into the unchanged source string. */
export interface LogicalLineIndex {
  readonly lineCount: number;
  /** Get one logical line length in UTF-16 code units. */
  lineLength(line: number): number | undefined;
  /** Convert a validated zero-based UTF-16 position to a source-string offset. */
  offsetAt(position: CodePosition): number;
}

/**
 * Index LF, CRLF, and bare-CR lines without normalizing source bytes.
 *
 * JavaScript string offsets and lengths use UTF-16 code units, which are the
 * only LSP coordinate encoding that the refactor path supports.
 */
export function createLogicalLineIndex(source: string): LogicalLineIndex {
  const lines: IndexedLine[] = [];
  let lineStart = 0;

  for (let offset = 0; offset < source.length; offset++) {
    const codeUnit = source.charCodeAt(offset);
    if (codeUnit !== 0x0a && codeUnit !== 0x0d) continue;

    lines.push({ startOffset: lineStart, length: offset - lineStart });
    if (codeUnit === 0x0d && source.charCodeAt(offset + 1) === 0x0a) offset++;
    lineStart = offset + 1;
  }
  lines.push({ startOffset: lineStart, length: source.length - lineStart });

  return {
    lineCount: lines.length,
    lineLength: (line) => lines[line]?.length,
    offsetAt: (position) => {
      const line = lines[position.line];
      if (!line || position.character < 0 || position.character > line.length) {
        throw new RangeError("Position is outside the logical source lines");
      }
      return line.startOffset + position.character;
    },
  };
}

/** Compare zero-based source positions lexicographically by line, then character. */
export function compareCodePositions(left: CodePosition, right: CodePosition): number {
  return left.line - right.line || left.character - right.character;
}
