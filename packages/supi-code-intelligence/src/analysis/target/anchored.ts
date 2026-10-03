/**
 * Anchored target resolution — resolves a file + position pair into a
 * typed target outcome using purely filesystem-level validation.
 *
 * This resolver does not require LSP or Tree-sitter. It validates
 * file existence, binary-file guards, and produces the necessary
 * position conversions for downstream semantic operations.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CodeRequestControl,
  type CodeSymbol,
  isCodeRequestInterruption,
  type SemanticProvider,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchorKind } from "../../session/target-store.ts";
import type { AnchoredResolutionMetadata, AnchoredResolutionSource } from "../../types/index.ts";
import { resolveFromStructural } from "./anchored-structural.ts";
import {
  canonicalFileDeclarationKind,
  createCodeSymbolIdentityResolver,
  type DeclarationOccurrenceIdentity,
} from "./identity.ts";
import { resolveTexlabSectionLabelCollision } from "./latex-label-container.ts";
import type { DisambiguationCandidateData, ResolvedTargetData, TargetOutcome } from "./types.ts";

/** 1-based symbol anchor position (mirrors the runtime `SymbolAnchor`). */
type Anchor = { line: number; character: number };

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".pdf",
  ".doc",
  ".docx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".node",
]);

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// ── Provider-backed anchored symbol resolution ────────────────────────

/** Provider methods used by anchored resolution. */
export interface AnchoredResolverProvider {
  documentSymbols?: SemanticProvider["documentSymbols"];
  nodeAt?: StructuralProvider["nodeAt"];
  outline?: StructuralProvider["outline"];
}

/**
 * Classify how (or whether) a document symbol relates to a 1-based coordinate.
 *
 * - `"exact"` — the coordinate lands on the identifier token (name anchor).
 * - `"snap"` — the coordinate lands on the declaration header/modifier area
 *   on the declaration line, before the identifier, and a name anchor exists
 *   to snap to.
 * - `null` — no relationship.
 */
function matchSymbolAt(s: CodeSymbol, line: number, character: number): "exact" | "snap" | null {
  const nameAnchor = s.nameAnchor;
  if (nameAnchor && nameAnchor.line === line) {
    const start = nameAnchor.character;
    const end = start + s.name.length;
    if (character >= start && character < end) return "exact";
  }
  const decl = s.declarationAnchor;
  if (decl.line === line && nameAnchor && nameAnchor.line === line) {
    if (character >= decl.character && character < nameAnchor.character) return "snap";
  }
  return null;
}

function buildResolution(
  requested: Anchor,
  resolvedAnchor: Anchor,
  snapped: boolean,
  source: AnchoredResolutionSource,
): AnchoredResolutionMetadata {
  return {
    requested: { line: requested.line, character: requested.character },
    resolved: { line: resolvedAnchor.line, character: resolvedAnchor.character },
    snapped,
    source,
  };
}

function resolvedFromSymbol(
  file: string,
  s: CodeSymbol,
  opts: {
    snapped: boolean;
    requested: Anchor;
    source: AnchoredResolutionSource;
    identity: DeclarationOccurrenceIdentity;
  },
): { kind: "resolved"; target: ResolvedTargetData } {
  const a = (s.nameAnchor ?? s.declarationAnchor) as Anchor;
  return {
    kind: "resolved",
    target: {
      file,
      position: { line: a.line - 1, character: a.character - 1 },
      displayLine: a.line,
      displayCharacter: a.character,
      declarationAnchor: { ...s.declarationAnchor },
      declarationOccurrence: opts.identity.declarationOccurrence,
      name: s.name,
      kind: s.kind,
      identityKind:
        canonicalFileDeclarationKind(file, s.kind, s.name) ?? opts.identity.identityKind,
      confidence: "semantic",
      provenance: opts.identity.structuralEvidence ? ["semantic", "structural"] : ["semantic"],
      anchorKind: (s.nameAnchor ? "name" : "declaration") as AnchorKind,
      container: s.container ?? null,
      resolution: buildResolution(opts.requested, a, opts.snapped, opts.source),
    },
  };
}

async function candidatesFromSymbols(
  file: string,
  matched: CodeSymbol[],
  resolveIdentity: (symbol: CodeSymbol) => Promise<DeclarationOccurrenceIdentity>,
): Promise<{
  kind: "disambiguation";
  candidates: DisambiguationCandidateData[];
  totalCount: number;
  omittedCount: number;
  partialReason: null;
}> {
  const candidates = await Promise.all(
    matched.map(async (s, idx) => {
      const a = (s.nameAnchor ?? s.declarationAnchor) as Anchor;
      const identity = await resolveIdentity(s);
      return {
        name: s.name,
        kind: s.kind,
        identityKind: canonicalFileDeclarationKind(file, s.kind, s.name) ?? identity.identityKind,
        provenance: identity.structuralEvidence
          ? (["semantic", "structural"] as const)
          : (["semantic"] as const),
        container: s.container ?? null,
        file,
        line: a.line,
        character: a.character,
        declarationAnchor: { ...s.declarationAnchor },
        declarationOccurrence: identity.declarationOccurrence,
        rank: idx + 1,
        anchorKind: (s.nameAnchor ? "name" : "declaration") as AnchorKind,
      } satisfies DisambiguationCandidateData;
    }),
  );
  return {
    kind: "disambiguation",
    candidates,
    totalCount: candidates.length,
    omittedCount: 0,
    partialReason: null,
  };
}

/** Layer 1: match the coordinate against LSP document symbols. Returns null to fall through. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: layered anchored resolution keeps layer-1 symbol matching and identity resolution together.
async function resolveFromSemantic(
  file: string,
  requested: Anchor,
  provider: AnchoredResolverProvider,
  control?: CodeRequestControl,
): Promise<TargetOutcome | null> {
  if (!provider.documentSymbols) return null;
  let symbols: CodeSymbol[] = [];
  try {
    const result = await provider.documentSymbols(file);
    if (result.kind !== "unavailable") symbols = result.data;
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    symbols = [];
  }
  if (symbols.length === 0) return null;

  const exact: CodeSymbol[] = [];
  const snap: CodeSymbol[] = [];
  for (const s of symbols) {
    const m = matchSymbolAt(s, requested.line, requested.character);
    if (m === "exact") exact.push(s);
    else if (m === "snap") snap.push(s);
  }

  const structural = provider.nodeAt ? { nodeAt: provider.nodeAt } : undefined;
  const resolveIdentity = createCodeSymbolIdentityResolver(file, symbols, structural, control);
  if (exact.length === 1) {
    return resolvedFromSymbol(file, exact[0], {
      snapped: false,
      requested,
      source: "semantic",
      identity: await resolveIdentity(exact[0]),
    });
  }
  if (exact.length > 1) return candidatesFromSymbols(file, exact, resolveIdentity);
  if (snap.length === 1) {
    return resolvedFromSymbol(file, snap[0], {
      snapped: true,
      requested,
      source: "semantic",
      identity: await resolveIdentity(snap[0]),
    });
  }
  if (snap.length > 1) return candidatesFromSymbols(file, snap, resolveIdentity);
  return null;
}

/**
 * Resolve a real symbol target from anchored coordinates using provider
 * evidence. Replaces the anonymous point-target behavior for `code_resolve`
 * and `code_orientation`.
 *
 * Layered resolution (per the coordinated-targets plan):
 * 1. Prefer LSP document-symbol evidence: exact identifier hit, declaration
 *    header snap (only when exactly one enclosing symbol is unambiguous), or
 *    explicit disambiguation candidates.
 * 2. Structural fallback via tree-sitter `nodeAt` — only when unambiguous and
 *    provider-backed: an identifier token that is a declaration name resolves
 *    to a structural name-anchor target; comment/string/non-symbol nodes fail
 *    honestly.
 * 3. If no provider-backed symbol target can be resolved, return an explicit
 *    error recommending `code_inspect` for point-level facts.
 *
 * This does not perform heuristic global text search and does not silently
 * treat declaration anchors as name anchors (ADR 0003).
 */
// biome-ignore lint/complexity/useMaxParams: anchored resolution is a stable public resolver boundary with fixed positional fields.
export async function resolveAnchoredSymbolTarget(
  file: string,
  line: number,
  character: number,
  provider: AnchoredResolverProvider | null,
  control?: CodeRequestControl,
): Promise<TargetOutcome> {
  if (!fs.existsSync(file)) {
    return { kind: "error", message: `File not found: \`${file}\`` };
  }
  if (isBinaryFile(file)) {
    return {
      kind: "error",
      message: `File type not supported for semantic analysis: \`${file}\`. Use PI read or grep for explicit filesystem inspection when appropriate.`,
    };
  }

  const requested: Anchor = { line, character };
  if (provider) {
    const semantic = await resolveFromSemantic(file, requested, provider, control);
    if (semantic) {
      return (
        (await resolveTexlabSectionLabelCollision(file, semantic, () =>
          resolveFromStructural(file, requested, provider, control),
        )) ?? semantic
      );
    }
    const structural = await resolveFromStructural(file, requested, provider, control);
    if (structural) return structural;
  }

  return { kind: "error", message: coordinateNotOnSymbolMessage(file, line, character, null) };
}

function coordinateNotOnSymbolMessage(
  file: string,
  line: number,
  character: number,
  detail: string | null,
): string {
  const at = `${path.basename(file)}:${line}:${character}`;
  const reason = detail ? ` (on \`${detail}\`)` : "";
  return (
    `No symbol target resolved at \`${at}\`${reason}. ` +
    "`code_resolve` resolves real symbol targets from provider-backed evidence; " +
    "use `code_inspect` for point-level facts at this coordinate, or pass the identifier coordinate of a declaration."
  );
}
