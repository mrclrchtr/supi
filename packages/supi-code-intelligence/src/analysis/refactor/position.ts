import type { CodePosition } from "@mrclrchtr/supi-code-runtime/api";

/** Compare zero-based source positions lexicographically by line, then character. */
export function compareCodePositions(left: CodePosition, right: CodePosition): number {
  return left.line - right.line || left.character - right.character;
}
