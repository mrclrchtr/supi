/**
 * Symbol target resolution — discovers symbols via the semantic substrate
 * and returns typed outcomes (resolved, disambiguation, kind mismatch, or error).
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
import type { TargetSymbolKind } from "../../session/target-input.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import { normalizePath } from "../search/paths.ts";
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

function hasSameDeclarationAnchor(candidate: CodeSymbol, workspaceSymbol: CodeSymbol): boolean {
  return (
    candidate.declarationAnchor.line === workspaceSymbol.declarationAnchor.line &&
    candidate.declarationAnchor.character === workspaceSymbol.declarationAnchor.character
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
    const result = await semantic.documentSymbols(workspaceSymbol.file);
    if (result.kind === "unavailable" || result.data.length === 0) return workspaceSymbol;

    const exactMatches = result.data.filter((candidate) =>
      isExactDocumentSymbolMatch(candidate, workspaceSymbol),
    );
    const declarationMatches = exactMatches.filter((candidate) =>
      hasSameDeclarationAnchor(candidate, workspaceSymbol),
    );
    const refined =
      declarationMatches.length === 1
        ? declarationMatches[0]
        : exactMatches.length === 1
          ? exactMatches[0]
          : undefined;
    if (!refined) return workspaceSymbol;

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
 * @returns Typed outcome: resolved, disambiguation, kind mismatch, or error
 */
export async function resolveSymbolTarget(
  symbol: string,
  cwd: string,
  semantic: SemanticSubstrate,
  options?: {
    path?: string;
    kind?: TargetSymbolKind;
    exportedOnly?: boolean;
    maxResults?: number;
  },
): Promise<TargetOutcome> {
  const result = await semantic.workspaceSymbols(symbol);
  if (result.kind === "unavailable") {
    return {
      kind: "error",
      message: `Symbol discovery for \`${symbol}\` is unavailable: ${result.reason}`,
    };
  }
  if (result.data.length === 0) {
    return { kind: "error", message: `Symbol not found: \`${symbol}\`` };
  }

  const scopePath = options?.path ? normalizePath(options.path, cwd) : null;
  const scoped = result.data.filter((candidate) =>
    scopePath ? isWithinOrEqual(scopePath, candidate.file) : true,
  );
  const eligible = options?.exportedOnly
    ? scoped.filter((candidate) => !NON_EXPORTED_KINDS.has(candidate.kind))
    : scoped;
  if (eligible.length === 0) {
    return {
      kind: "error",
      message: `Symbol not found: \`${symbol}\`${scopePath ? ` in path \`${options?.path}\`` : ""}`,
    };
  }

  const requestedKind = options?.kind;
  if (requestedKind) {
    const exactKind = eligible.filter((candidate) =>
      providerKindMatches(candidate.kind, requestedKind),
    );
    if (exactKind.length === 0) {
      return buildCandidateOutcome({
        kind: "kind-mismatch",
        candidates: eligible,
        semantic,
        cwd,
        maxResults: options.maxResults,
        requestedKind,
      });
    }
    return resolveCandidates(exactKind, semantic, cwd, options.maxResults);
  }

  return resolveCandidates(eligible, semantic, cwd, options?.maxResults);
}

function providerKindMatches(reported: string, requested: TargetSymbolKind): boolean {
  return normalizeProviderKind(reported) === normalizeProviderKind(requested);
}

function normalizeProviderKind(kind: string): string {
  return kind.replace(/[\s_-]/g, "").toLowerCase();
}

async function resolveCandidates(
  candidates: readonly CodeSymbol[],
  semantic: SemanticSubstrate,
  cwd: string,
  maxResults?: number,
): Promise<TargetOutcome> {
  const ranged = candidates.filter(
    (candidate) =>
      candidate.declarationAnchor.line > 0 || candidate.declarationAnchor.character > 0,
  );
  if (ranged.length === 1) {
    return resolvedTarget(await refineResolvedSymbolAnchor(ranged[0], semantic));
  }
  return buildCandidateOutcome({
    kind: "disambiguation",
    candidates,
    semantic,
    cwd,
    maxResults,
  });
}

function resolvedTarget(candidate: CodeSymbol): TargetOutcome {
  const anchor = anchorOf(candidate);
  return {
    kind: "resolved",
    target: {
      file: candidate.file,
      position: { line: anchor.line - 1, character: anchor.character - 1 },
      displayLine: anchor.line,
      displayCharacter: anchor.character,
      declarationAnchor: { ...candidate.declarationAnchor },
      declarationOccurrence: 0,
      name: candidate.name,
      kind: candidate.kind,
      confidence: "semantic",
      provenance: ["semantic"],
      anchorKind: (candidate.nameAnchor ? "name" : "declaration") as AnchorKind,
      container: candidate.container ?? null,
    },
  };
}

interface CandidateOutcomeBase {
  candidates: readonly CodeSymbol[];
  semantic: SemanticSubstrate;
  cwd: string;
  maxResults?: number;
}

type CandidateOutcomeOptions = CandidateOutcomeBase &
  (
    | { kind: "disambiguation"; requestedKind?: never }
    | { kind: "kind-mismatch"; requestedKind: TargetSymbolKind }
  );

/**
 * Refine only bounded visible candidates to name anchors while retaining the
 * exact provider result count for omission disclosure. No candidate is
 * promoted when the requested provider kind did not match.
 */
async function buildCandidateOutcome(
  options: CandidateOutcomeOptions,
): Promise<Extract<TargetOutcome, { kind: "disambiguation" | "kind-mismatch" }>> {
  const cap = options.maxResults ?? MAX_CANDIDATES;
  const refined = await Promise.all(
    options.candidates
      .slice(0, cap)
      .map((candidate) => refineResolvedSymbolAnchor(candidate, options.semantic)),
  );
  const common = {
    candidates: toDisambiguationCandidates(refined, options.cwd),
    omittedCount: Math.max(0, options.candidates.length - cap),
  };
  return options.kind === "kind-mismatch"
    ? {
        kind: options.kind,
        requestedKind: options.requestedKind,
        ...common,
      }
    : { kind: options.kind, ...common };
}

function toDisambiguationCandidates(
  candidates: readonly CodeSymbol[],
  cwd: string,
): DisambiguationCandidateData[] {
  const occurrences = new Map<string, number>();
  return candidates.map((candidate, index) => {
    const relFile = path.relative(cwd, candidate.file);
    const anchor = anchorOf(candidate);
    const occurrenceKey = [
      relFile,
      candidate.declarationAnchor.line,
      candidate.name,
      candidate.kind,
      candidate.container ?? "",
    ].join("\0");
    const declarationOccurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, declarationOccurrence + 1);
    return {
      name: candidate.name,
      kind: candidate.kind,
      container: candidate.container ?? null,
      file: relFile,
      line: anchor.line,
      character: anchor.character,
      declarationAnchor: { ...candidate.declarationAnchor },
      declarationOccurrence,
      rank: index + 1,
      anchorKind: (candidate.nameAnchor ? "name" : "declaration") as AnchorKind,
    };
  });
}
