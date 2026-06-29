/**
 * Query normalization — converts raw tool/action parameters into a
 * pre-classified {@link NormalizedQuery}.
 *
 * This is the first step in the targeting pipeline. Callers receive
 * a disambiguated query kind so downstream resolvers can dispatch
 * without re-checking input shapes.
 */

import type { NormalizedQuery } from "./types.ts";

export interface QueryInput {
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  kind?: string;
  exportedOnly?: boolean;
}

/**
 * Normalize a raw params bag into a typed {@link NormalizedQuery}.
 *
 * Priority order:
 * 1. anchored: file + line + character
 * 2. scoped symbol: file + symbol (without coordinates) — uses file as path scope for symbol discovery
 * 3. file: file without coordinates or symbol
 * 4. symbol: symbol without file
 * 5. invalid: neither file nor symbol
 */
export function normalizeQuery(input: QueryInput): NormalizedQuery {
  if (input.file && input.line != null && input.character != null) {
    return {
      kind: "anchored",
      file: input.file,
      line: input.line,
      character: input.character,
    };
  }

  // Scoped symbol: both file and symbol present, no line/character.
  // The file acts as a path scope for symbol discovery — resolves to a
  // precise target within that file rather than a file-level group.
  if (input.file && input.symbol) {
    return {
      kind: "symbol",
      symbol: input.symbol,
      path: input.file,
      symbolKind: input.kind,
      exportedOnly: input.exportedOnly,
    };
  }

  if (input.file) {
    return { kind: "file", file: input.file };
  }

  if (input.symbol) {
    return {
      kind: "symbol",
      symbol: input.symbol,
      path: input.path,
      symbolKind: input.kind,
      exportedOnly: input.exportedOnly,
    };
  }

  return {
    kind: "invalid",
    reason:
      "Semantic actions require either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
  };
}
