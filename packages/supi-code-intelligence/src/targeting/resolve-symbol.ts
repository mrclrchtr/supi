/**
 * Symbol target resolution — discovers symbols via the semantic substrate
 * and returns typed outcomes (resolved, disambiguation, or error).
 *
 * This resolver is semantic-only: it does not fall back to text search
 * or heuristic guessing. Ambiguous matches produce explicit disambiguation.
 */

import * as path from "node:path";
import type { SemanticProvider as SemanticSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import type { DisambiguationCandidateData, TargetOutcome } from "./types.ts";

const MAX_CANDIDATES = 8;
const NON_EXPORTED_KINDS = new Set(["Variable", "Field", "Property"]);

/**
 * Resolve a symbol via the semantic substrate.
 *
 * @param symbol - the symbol name to search for
 * @param cwd - session working directory
 * @param semantic - the semantic substrate (LSP-backed)
 * @param options - optional filters: path scope, kind filter, exported-only
 * @returns Typed outcome: resolved, disambiguation, or error
 */
export async function resolveSymbolTarget(
  symbol: string,
  cwd: string,
  semantic: SemanticSubstrate,
  options?: {
    path?: string;
    kind?: string;
    exportedOnly?: boolean;
  },
): Promise<TargetOutcome> {
  const results = await semantic.workspaceSymbols(symbol);
  if (results === null) {
    return {
      kind: "error",
      message: `Symbol discovery for \`${symbol}\` requires active LSP. Use \`file\` + coordinates, or enable LSP and retry.`,
    };
  }
  if (results.length === 0) {
    return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
  }

  // Filter by path scope
  const scopePath = options?.path ? path.resolve(cwd, options.path) : null;
  let candidates = results.filter((s) => {
    if (scopePath && !isWithinOrEqual(scopePath, s.file)) return false;
    return true;
  });

  // Filter by kind
  if (options?.kind) {
    const kindLower = options.kind.toLowerCase();
    candidates = candidates.filter((s) => s.kind.toLowerCase().includes(kindLower));
  }

  // Filter to exported symbols only
  if (options?.exportedOnly) {
    candidates = candidates.filter((s) => !NON_EXPORTED_KINDS.has(s.kind));
  }

  // Range-less candidates (line=0,char=0) come from URI-only workspace symbols.
  // Keep them for disambiguation but don't promote to single-match resolution.
  const ranged = candidates.filter((s) => s.line > 0 || s.character > 0);

  if (ranged.length === 1) {
    const c = ranged[0];
    return {
      kind: "resolved",
      target: {
        file: c.file,
        position: { line: c.line - 1, character: c.character - 1 },
        displayLine: c.line,
        displayCharacter: c.character,
        name: c.name,
        kind: c.kind,
        confidence: "semantic",
      },
    };
  }

  // All candidates lost or only rangeless
  if (candidates.length === 0) {
    return {
      kind: "error",
      message: `Symbol not found: \`${symbol}\`${scopePath ? ` in path \`${options?.path}\`` : ""}`,
    };
  }

  // Multiple candidates — return disambiguation
  const candidatesOut = candidates.slice(0, MAX_CANDIDATES).map((c, idx) => ({
    name: c.name,
    kind: c.kind,
    container: c.container ?? null,
    file: path.relative(cwd, c.file),
    line: c.line,
    character: c.character,
    reason: path.relative(cwd, c.file),
    rank: idx + 1,
  })) satisfies DisambiguationCandidateData[];

  return {
    kind: "disambiguation",
    candidates: candidatesOut,
    omittedCount: Math.max(0, candidates.length - MAX_CANDIDATES),
  };
}
