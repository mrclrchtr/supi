import type { LspClient } from "../client/client.ts";

/**
 * Rows the native TypeScript server returns at most per query; it sorts by match
 * quality and drops the rest. tsserver behind typescript-language-server has no limit.
 */
const NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT = 256;

/**
 * Describe a TypeScript answer that may be cut at the native server's row limit,
 * or `null` when it is not. An unknown backend (manual launch) counts as possibly
 * native; more rows than the limit prove it is not.
 */
export function nativeTypeScriptLimitReason(
  client: LspClient,
  rowCount: number,
  scoped: boolean,
): string | null {
  if (
    client.name !== "typescript" ||
    client.typescriptSelection?.backend === "tsserver" ||
    rowCount !== NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT
  ) {
    return null;
  }
  // The limit applies before scope filtering, so a scope cannot be narrowed around it.
  const next = scoped
    ? "Use a more specific query, or resolve the declaration by its file or position."
    : "Use a more specific query or a scope.";
  return (
    `The TypeScript server returned its limit of ${NATIVE_TYPESCRIPT_WORKSPACE_SYMBOL_LIMIT} ` +
    `workspace symbols; more matches may exist. ${next}`
  );
}
