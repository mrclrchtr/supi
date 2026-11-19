import type { LspClient } from "../client/client.ts";

/**
 * Rows the native TypeScript server returns at most per query; it sorts by match
 * quality and drops the rest. tsserver behind typescript-language-server has no limit.
 *
 * A cut answer has exactly this many rows. Newer servers skip rows whose name has no
 * single-segment source mapping, which only content-mapped files produce; content
 * mappers need `--runExternalCode`, which the automatic launch does not pass.
 */
const NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT = 256;

/** A TypeScript answer that may be cut at the native server's row limit. */
export interface WorkspaceSymbolRowLimit {
  readonly reason: string;
  /**
   * The cut answer still holds every declaration whose name equals the query
   * (ignoring case), so only partial-name matches may be missing.
   */
  readonly exactNamesComplete: boolean;
}

/**
 * Describe a TypeScript answer that may be cut at the native server's row limit,
 * or `null` when it is not. An unknown backend (manual launch) counts as possibly
 * native; more rows than the limit prove it is not.
 */
export function nativeTypeScriptRowLimit(
  client: LspClient,
  rows: readonly { readonly name: string }[],
  query: string,
  scoped: boolean,
): WorkspaceSymbolRowLimit | null {
  if (
    client.name !== "typescript" ||
    client.typescriptSelection?.backend === "tsserver" ||
    rows.length !== NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT
  ) {
    return null;
  }
  const prefix = `The TypeScript server returned its limit of ${NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT} workspace symbols`;
  if (exactNamesFirst(rows, query)) {
    return {
      reason: `${prefix}; it includes every declaration named \`${query}\`, but more partial-name matches may exist.`,
      exactNamesComplete: true,
    };
  }
  // The limit applies before scope filtering, so a scope cannot be narrowed around it.
  const next = scoped
    ? "Use a more specific query, or pass an anchor target (file, line, character)."
    : "Use a more specific query or a scope.";
  return {
    reason: `${prefix}; more matches may exist. ${next}`,
    exactNamesComplete: false,
  };
}

/**
 * True when the cut answer provably holds every name equal to the query.
 *
 * typescript-go (`internal/ls/symbols.go`) sorts by match score, then by
 * case-insensitive name, before it cuts. A name equal to the query scores 0 and
 * sorts before every longer score-0 name, which starts with the query. So when
 * all equal names lead the answer and the last row differs, none were cut. An
 * answer in another order proves nothing.
 */
function exactNamesFirst(rows: readonly { readonly name: string }[], query: string): boolean {
  const folded = query.toLowerCase();
  const equal = (row: { readonly name: string }) => row.name.toLowerCase() === folded;
  const firstOther = rows.findIndex((row) => !equal(row));
  return firstOther >= 0 && !rows.slice(firstOther).some(equal);
}
