import type { Parser } from "web-tree-sitter";
import type { GrammarId } from "../types.ts";

interface ParserEntryLike {
  readonly parser: Parser;
}

/** Reset an interrupted parser, or discard it when reset cannot restore safe reuse. */
export function resetInterruptedParser<T extends ParserEntryLike>(
  parsers: Map<GrammarId, T>,
  grammarId: GrammarId,
  entry: T,
): void {
  try {
    entry.parser.reset();
  } catch {
    if (parsers.get(grammarId) === entry) parsers.delete(grammarId);
    try {
      entry.parser.delete();
    } catch {
      // The failed parser is already removed from reuse.
    }
  }
}
