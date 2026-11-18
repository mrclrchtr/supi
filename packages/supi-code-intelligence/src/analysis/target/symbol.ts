/**
 * Symbol target resolution — discovers symbols via the semantic substrate
 * and returns typed outcomes (resolved, disambiguation, kind mismatch, or error).
 *
 * This resolver is semantic-only: it does not fall back to text search
 * or heuristic guessing. Ambiguous matches produce explicit disambiguation.
 */

import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  type CodeSymbol,
  isCodeRequestInterruption,
  type SemanticProvider as SemanticSubstrate,
  type StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import type { TargetSymbolKind } from "../../session/target-input.ts";
import type { AnchorKind } from "../../session/target-store.ts";
import { createEvidenceList, createPartialEvidenceList } from "../evidence.ts";
import { describePartialQuery } from "../search/exclusions.ts";
import { normalizePath } from "../search/paths.ts";
import { declarationsAmong, unlistedNote, unselectedNote } from "./symbol-selection.ts";
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
  control?: CodeRequestControl,
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
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
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
    control?: CodeRequestControl;
    /** Syntax provider used to tell declarations from import and export-list bindings. */
    structural?: StructuralSubstrate;
  },
): Promise<TargetOutcome> {
  const scopePath = options?.path ? normalizePath(options.path, cwd) : null;
  const result = await semantic.workspaceSymbols(
    symbol,
    options?.control,
    scopePath ? [scopePath] : undefined,
  );
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      reason: `Symbol discovery for \`${symbol}\` is unavailable: ${result.reason}`,
    };
  }
  if (result.data.length === 0) return emptySymbolOutcome(symbol, result, cwd, options?.path);

  const scoped = result.data
    .filter((candidate) => (scopePath ? isWithinOrEqual(scopePath, candidate.file) : true))
    .sort((a, b) => Number(b.name === symbol) - Number(a.name === symbol));
  const eligible = options?.exportedOnly
    ? scoped.filter((candidate) => !NON_EXPORTED_KINDS.has(candidate.kind))
    : scoped;
  if (eligible.length === 0) return emptySymbolOutcome(symbol, result, cwd, options?.path);

  const requestedKind = options?.kind;
  if (requestedKind) {
    const exactKind = eligible.filter((candidate) =>
      providerKindMatches(candidate.kind, requestedKind),
    );
    if (exactKind.length === 0) {
      return buildCandidateOutcome({
        kind: "kind-mismatch",
        candidates: eligible,
        discovery: candidateDiscovery(result, cwd),
        semantic,
        cwd,
        maxResults: options.maxResults,
        requestedKind,
        control: options.control,
      });
    }
    return resolveCandidates({
      symbol,
      candidates: exactKind,
      discovery: candidateDiscovery(result, cwd),
      exclusionNote: exclusionOnlyNote(result, cwd),
      semantic,
      cwd,
      maxResults: options.maxResults,
      control: options.control,
      structural: options.structural,
    });
  }

  return resolveCandidates({
    symbol,
    candidates: eligible,
    discovery: candidateDiscovery(result, cwd),
    exclusionNote: exclusionOnlyNote(result, cwd),
    semantic,
    cwd,
    maxResults: options?.maxResults,
    control: options?.control,
    structural: options?.structural,
  });
}

function providerKindMatches(reported: string, requested: TargetSymbolKind): boolean {
  return normalizeProviderKind(reported) === normalizeProviderKind(requested);
}

function normalizeProviderKind(kind: string): string {
  return kind.replace(/[\s_-]/g, "").toLowerCase();
}

async function resolveCandidates(
  options: CandidateOutcomeBase & {
    /** The queried name; one case-sensitive exact match wins over partial-name matches. */
    symbol: string;
    discovery: CandidateDiscovery;
    /** Disclosure for a unique match beside policy-excluded rows. */
    exclusionNote?: string;
  },
): Promise<TargetOutcome> {
  const { candidates, semantic, cwd, maxResults, control, discovery, exclusionNote } = options;
  const ranged = candidates.filter(
    (candidate) =>
      candidate.declarationAnchor.line > 0 || candidate.declarationAnchor.character > 0,
  );
  // Workspace-symbol providers match substrings, so a query for `foo` also returns `fooBar`.
  const exact = ranged.filter((candidate) => candidate.name === options.symbol);
  const complete = discovery.partialMessage === null;
  const declared =
    complete && exact.length > 1
      ? await declarationsAmong(exact, options.structural, control)
      : exact;
  const selected =
    ranged.length === 1 ? ranged[0] : declared.length === 1 ? declared[0] : undefined;
  if (selected && complete) {
    const resolved = resolvedTarget(await refineResolvedSymbolAnchor(selected, semantic, control));
    // Unselected rows stay disclosed: bindings, partial-name matches, and policy exclusions.
    const notes = [unselectedNote(candidates, selected, options.symbol), exclusionNote].filter(
      (note): note is string => note !== undefined,
    );
    return notes.length > 0 ? { ...resolved, notes } : resolved;
  }
  // Several declarations of the queried name: partial-name matches cannot be meant.
  const listed = complete && declared.length > 1 ? declared : candidates;
  const outcome = await buildCandidateOutcome({
    kind: "disambiguation",
    candidates: listed,
    semantic,
    cwd,
    maxResults,
    discovery,
    control,
  });
  const note = unlistedNote(candidates, listed, options.symbol);
  return note ? { ...outcome, candidateNotes: [note] } : outcome;
}

function resolvedTarget(candidate: CodeSymbol): Extract<TargetOutcome, { kind: "resolved" }> {
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
  control?: CodeRequestControl;
  structural?: StructuralSubstrate;
}

/**
 * Candidate collection status before the cap: exact when the provider was
 * complete or removed only policy-excluded rows; otherwise provider-limited.
 */
interface CandidateDiscovery {
  readonly partialMessage: string | null;
}

function candidateDiscovery(
  result: Exclude<CodeQueryResult<CodeSymbol[]>, { kind: "unavailable" }>,
  cwd: string,
): CandidateDiscovery {
  // Policy exclusions alone remove only rows the workspace marked out of
  // automatic scope; the retained in-policy rows are complete. Failures and
  // coverage gaps keep the total unknown.
  return result.kind === "partial" && result.metadata?.exclusionOnly !== true
    ? { partialMessage: describePartialQuery(result.reason, result.metadata, cwd) }
    : { partialMessage: null };
}

/** Describe exclusion-only evidence so a resolved target still discloses dropped rows. */
function exclusionOnlyNote(
  result: Exclude<CodeQueryResult<CodeSymbol[]>, { kind: "unavailable" }>,
  cwd: string,
): string | undefined {
  if (result.kind !== "partial" || result.metadata?.exclusionOnly !== true) return undefined;
  return describePartialQuery(result.reason, result.metadata, cwd);
}

type CandidateOutcomeOptions = CandidateOutcomeBase & { discovery: CandidateDiscovery } & (
    | { kind: "disambiguation"; requestedKind?: never }
    | { kind: "kind-mismatch"; requestedKind: TargetSymbolKind }
  );

/**
 * Refine only bounded visible candidates to name anchors while retaining the
 * exact provider result count for omission disclosure. No candidate is
 * promoted when the requested provider kind did not match.
 */
function emptySymbolOutcome(
  symbol: string,
  result: Exclude<CodeQueryResult<CodeSymbol[]>, { kind: "unavailable" }>,
  cwd: string,
  scope?: string,
): TargetOutcome {
  if (result.kind === "partial") {
    return {
      kind: "unavailable",
      reason: `Symbol discovery for \`${symbol}\` is incomplete: ${describePartialQuery(result.reason, result.metadata, cwd)}`,
    };
  }
  return {
    kind: "error",
    message: [
      `Symbol not found: \`${symbol}\`${scope ? ` in path \`${scope}\`` : ""}.`,
      "Workspace-symbol search covers only files in projects the language server has loaded; files outside them (e.g. excluded by tsconfig or in another toolchain's subtree) are not searched.",
      'Next: `code_find` with `search.ast` and `kind: "definition"` for a structural search, `code_resolve` with `target.file` if the file is known, or an anchor target (file/line/character) if the location is known.',
    ].join(" "),
  };
}

async function buildCandidateOutcome(
  options: CandidateOutcomeOptions,
): Promise<Extract<TargetOutcome, { kind: "disambiguation" | "kind-mismatch" }>> {
  const cap = options.maxResults ?? MAX_CANDIDATES;
  const { partialMessage } = options.discovery;
  const bounded =
    partialMessage === null
      ? createEvidenceList({ key: "target.candidates", items: options.candidates, maxResults: cap })
      : createPartialEvidenceList({
          key: "target.candidates",
          items: options.candidates,
          maxResults: cap,
          partialReason: "provider-limited",
          partialMessage,
        });
  const refined = await Promise.all(
    bounded.items.map((candidate) =>
      refineResolvedSymbolAnchor(candidate, options.semantic, options.control),
    ),
  );
  const common = {
    candidates: toDisambiguationCandidates(refined, options.cwd),
    candidateEvidence: bounded.metadata,
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
