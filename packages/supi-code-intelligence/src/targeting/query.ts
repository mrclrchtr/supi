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
 * 2. file: file without coordinates
 * 3. symbol: symbol without file
 * 4. invalid: neither file nor symbol
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
