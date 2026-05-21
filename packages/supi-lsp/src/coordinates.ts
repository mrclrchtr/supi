import type { Position } from "./config/types.ts";

/** Convert public 1-based coordinates into a 0-based LSP position. */
export function toLspPosition(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 };
}

/** Convert a 0-based LSP position into 1-based display coordinates. */
export function toOneBasedPosition(position: Position): { line: number; character: number } {
  return { line: position.line + 1, character: position.character + 1 };
}
