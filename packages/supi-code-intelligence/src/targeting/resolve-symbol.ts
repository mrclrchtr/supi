/**
 * Symbol target resolution — discovers symbols via the semantic substrate
 * and returns typed outcomes (resolved, disambiguation, or error).
 *
 * This resolver is semantic-only: it does not fall back to text search
 * or heuristic guessing. Ambiguous matches produce explicit disambiguation.
 */

import * as path from "node:path";
import type {
  CodeSymbol,
  SemanticProvider as SemanticSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { normalizePath } from "../search-helpers.ts";
import type { DisambiguationCandidateData, TargetOutcome } from "./types.ts";

const MAX_CANDIDATES = 8; // default fallback when maxResults is not provided
const NON_EXPORTED_KINDS = new Set(["Variable", "Field", "Property"]);

function normalizeContainer(container: string | null | undefined): string | null {
  return container ?? null;
}

function isExactDocumentSymbolMatch(candidate: CodeSymbol, workspaceSymbol: CodeSymbol): boolean {
  return (
    candidate.name === workspaceSymbol.name &&
    candidate.kind === workspaceSymbol.kind &&
    normalizeContainer(candidate.container) === normalizeContainer(workspaceSymbol.container)
  );
}

/**
 * The preferred anchor for resolution/downstream: the name (identifier) anchor
 * when the provider derived it, else the declaration anchor. Strict consumers
 * (tree-sitter `calleesAt`, LSP `rename`) prefer the name anchor; tolerant
 * consumers (`references`, `implementation`, `definition`) accept either.
 * Per ADR 0003. When `nameAnchor` is absent, strict consumers that consume
 * this anchor should hard-fail observably (slice D) rather than silently use
 * the declaration — handled at the consumer boundary, not here.
 */
function anchorOf(s: CodeSymbol): CodeSymbol["declarationAnchor"] {
  return s.nameAnchor ?? s.declarationAnchor;
}

/**
 * Prefer a document-symbol anchor when it provides one unambiguous exact match
 * for the already-selected workspace symbol.
 */
async function refineResolvedSymbolAnchor(
  workspaceSymbol: CodeSymbol,
  semantic: SemanticSubstrate,
): Promise<CodeSymbol> {
  try {
    const documentSymbols = await semantic.documentSymbols(workspaceSymbol.file);
    if (!documentSymbols || documentSymbols.length === 0) {
      return workspaceSymbol;
    }

    const exactMatches = documentSymbols.filter((candidate) =>
      isExactDocumentSymbolMatch(candidate, workspaceSymbol),
    );
    if (exactMatches.length !== 1) {
      return workspaceSymbol;
    }

    const refined = exactMatches[0];
    const a = anchorOf(refined);
    if (a.line <= 0 && a.character <= 0) {
      return workspaceSymbol;
    }

    return refined;
  } catch {
    return workspaceSymbol;
  }
}

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
    maxResults?: number;
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

  // Filter by path scope. Tool paths may include pi's leading `@` prefix;
  // normalize through the shared path helper so every caller gets the same
  // scope semantics.
  const scopePath = options?.path ? normalizePath(options.path, cwd) : null;
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
  const ranged = candidates.filter(
    (s) => s.declarationAnchor.line > 0 || s.declarationAnchor.character > 0,
  );

  if (ranged.length === 1) {
    const c = await refineResolvedSymbolAnchor(ranged[0], semantic);
    const a = anchorOf(c);
    return {
      kind: "resolved",
      target: {
        file: c.file,
        position: { line: a.line - 1, character: a.character - 1 },
        displayLine: a.line,
        displayCharacter: a.character,
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

  // Multiple candidates — refine each to a name (identifier) anchor before
  // returning disambiguation, so position-strict downstream substrates
  // (tree-sitter calleesAt, LSP rename) receive the identifier anchor rather
  // than the declaration anchor (the `export` keyword) that workspace-symbol
  // hits carry. Mirrors the single-match refine path above.
  // Per ADR 0003, `anchorOf` prefers the refined doc symbol's `nameAnchor`.
  // TODO: batch the per-file documentSymbols dedupe across candidates.
  const cap = options?.maxResults ?? MAX_CANDIDATES;
  const refined = await Promise.all(
    candidates.slice(0, cap).map((c) => refineResolvedSymbolAnchor(c, semantic)),
  );
  const candidatesOut = refined.map((c, idx) => {
    const relFile = path.relative(cwd, c.file);
    const a = anchorOf(c);
    return {
      name: c.name,
      kind: c.kind,
      container: c.container ?? null,
      file: relFile,
      line: a.line,
      character: a.character,
      reason: relFile,
      rank: idx + 1,
    };
  }) satisfies DisambiguationCandidateData[];

  return {
    kind: "disambiguation",
    candidates: candidatesOut,
    omittedCount: Math.max(0, candidates.length - cap),
  };
}
