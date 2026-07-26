import { getSupportedExtensionGrammarEntries, isJsTsGrammar } from "./language.ts";
import { supportsCallSitesGrammar } from "./tool/call-sites.ts";
import type { GrammarId, SupportedExtension } from "./types.ts";

/** Structural collection operations whose language support defines an AST Scan universe. */
const STRUCTURAL_SEARCH_OPERATIONS = ["outline", "imports", "exports", "call-sites"] as const;

/** One Tree-sitter structural collection operation used by code-aware search. */
export type StructuralSearchOperation = (typeof STRUCTURAL_SEARCH_OPERATIONS)[number];

/**
 * Return the file extensions that the concrete extractor supports for an operation.
 *
 * This is operation support, not general parser support. The result is derived from
 * the same grammar predicates and query registry used by the extractors themselves.
 */
export function getStructuralSearchSupportedExtensions(
  operation: StructuralSearchOperation,
): SupportedExtension[] {
  return getSupportedExtensionGrammarEntries()
    .filter(([, grammar]) => supportsGrammarOperation(grammar, operation))
    .map(([extension]) => extension);
}

/** Return whether one grammar is supported by the requested structural operation. */
export function supportsGrammarOperation(
  grammar: GrammarId,
  operation: StructuralSearchOperation,
): boolean {
  switch (operation) {
    case "call-sites":
      return supportsCallSitesGrammar(grammar);
    case "outline":
    case "imports":
    case "exports":
      return isJsTsGrammar(grammar);
    default:
      throw new TypeError(`Unsupported structural search operation: ${String(operation)}`);
  }
}
