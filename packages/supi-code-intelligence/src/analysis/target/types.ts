/**
 * Targeting types — normalized query and typed outcomes for the
 * target-resolution pipeline.
 *
 * These types decouple request normalization from resolution implementation
 * and keep action-facing code focused on routing, not string building.
 */

import type {
  SemanticProvider as SemanticSubstrate,
  SourceRange,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { TargetSymbolKind } from "../../session/target-input.ts";
import type { AnchorKind, TargetProviderProvenance } from "../../session/target-store.ts";

export type { TargetProviderProvenance } from "../../session/target-store.ts";

// ── Normalized query ──────────────────────────────────────────────────

/**
 * A pre-classified target request extracted from tool/action parameters.
 *
 * The pipeline normalizes incoming params into one of these shapes
 * so each resolver phase can operate on an already-disambiguated query.
 */
export type NormalizedQuery =
  | {
      kind: "anchored";
      file: string;
      line: number;
      character: number;
    }
  | {
      kind: "file";
      file: string;
    }
  | {
      kind: "symbol";
      symbol: string;
      path?: string;
      symbolKind?: string;
      exportedOnly?: boolean;
    }
  | {
      kind: "invalid";
      reason: string;
    };

// ── Resolver dependency injection ─────────────────────────────────────

/**
 * Substrates and context injected into the resolution pipeline.
 *
 * Passed from the action/tool entrypoint rather than constructed
 * inside resolver internals, so fallback policy is explicit.
 */
export interface ResolverDeps {
  cwd: string;
  semantic?: SemanticSubstrate;
  structural?: StructuralSubstrate;
}

// ── Typed resolution outcomes ─────────────────────────────────────────

/**
 * A successfully resolved anchored target with 0-/1-based positions.
 */
export interface ResolvedTargetData {
  file: string;
  /** 0-based position for LSP calls */
  position: { line: number; character: number };
  /** 1-based position for user display */
  displayLine: number;
  displayCharacter: number;
  /**
   * Stable 1-based declaration occurrence used for target identity. Unlike
   * the preferred display anchor, this does not move during name refinement.
   */
  declarationAnchor: { line: number; character: number };
  /** Zero-based occurrence among otherwise-identical declarations on that line. */
  declarationOccurrence: number;
  name: string | null;
  kind: string | null;
  /** Structural source-language declaration kind, separate from common identity kind. */
  nativeKind?: string;
  /** Evidence-backed provider-independent kind used for matching and handle identity. */
  identityKind?: string;
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
  /** Provider families that established this declaration, strongest first. */
  provenance: readonly TargetProviderProvenance[];
  /** Which anchor this target carries — drives strict-consumer enforcement (ADR 0003). */
  anchorKind: AnchorKind;
  /** Named symbolic container, or null when no container name was reported. */
  container: string | null;
  /**
   * Resolution provenance — present when the target was resolved from
   * anchored coordinates. Carries requested/resolved coordinates, whether the
   * anchor was snapped, and the provider-backed evidence source.
   */
  resolution?: import("../../types/index.ts").AnchoredResolutionMetadata;
}

/** Names left out of a File outline that sit on a contiguous span of lines. */
export interface FileOutlineNameSpan {
  readonly count: number;
  /** 1-based first and last line holding such a name. */
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Declarations discovered in a file but left out of its File outline, counted
 * so an agent can request them explicitly.
 */
export interface FileOutlineNotListed {
  /** Names bound by import statements; the file does not declare them. */
  readonly importedNames: FileOutlineNameSpan | null;
  /** Names inside `export { … }` lists, including re-exports `export { … } from`. */
  readonly exportListNames: FileOutlineNameSpan | null;
  /** `export … from` statements; they only forward names declared in other modules. */
  readonly reExportStatements: FileOutlineNameSpan | null;
  /** Declarations inside function, method, or constructor bodies. */
  readonly localDeclarations: number;
}

/**
 * The File outline of one file: its top-level declarations and members,
 * without imported names, export-list names, and local declarations.
 */
export interface FileOutlineData {
  file: string;
  displayName: string;
  targets: ResolvedTargetData[];
  /** Providers that successfully enumerated the selected file. */
  discoveryProvenance: readonly TargetProviderProvenance[];
  /** Conservative confidence across the complete outline, before display capping. */
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
  /** Declarations in the complete outline whose provider reported no enclosing declaration. */
  unknownLevelCount: number;
  /** Partial provider collection; targets remain usable and exact absence is not claimed. */
  partial?: { reason: string; errorRanges: readonly SourceRange[] };
  /** Discovered declarations left out of `targets`, with exact counts. */
  notListed: FileOutlineNotListed;
}

/**
 * A disambiguation candidate for symbol searches with multiple matches.
 */
export interface DisambiguationCandidateData {
  name: string;
  kind: string | null;
  /** Evidence-backed provider-independent kind used for handle identity. */
  identityKind?: string;
  /** Provider families that established this candidate declaration. */
  provenance?: readonly TargetProviderProvenance[];
  container: string | null;
  file: string;
  line: number;
  character: number;
  /** Stable 1-based declaration occurrence for target identity. */
  declarationAnchor: { line: number; character: number };
  /** Zero-based occurrence among otherwise-identical declarations on that line. */
  declarationOccurrence: number;
  rank: number;
  /** Which anchor this candidate carries (ADR 0003). */
  anchorKind: AnchorKind;
}

/** Completeness metadata for a bounded candidate collection. */
export interface TargetCandidateCompleteness {
  /** Exact candidate total, or null when the provider returned partial data. */
  totalCount: number | null;
  /** Candidates returned by the provider but hidden by the target cap. */
  omittedCount: number;
  /** Why the provider cannot establish an exact candidate total. */
  partialReason: "provider-limited" | null;
  /** Provider explanation for incomplete discovery, when available. */
  partialMessage?: string;
}

/**
 * Typed outcome of a resolution attempt.
 *
 * Actions consume these to produce user-facing strings/details;
 * the resolution pipeline itself stays presentation-agnostic.
 */
export type TargetOutcome =
  | {
      kind: "resolved";
      target: ResolvedTargetData;
      /** Request-scoped evidence notes, such as policy exclusions beside a unique match. */
      notes?: readonly string[];
    }
  | { kind: "file-outline"; outline: FileOutlineData }
  | ({
      kind: "disambiguation";
      candidates: DisambiguationCandidateData[];
    } & TargetCandidateCompleteness)
  | ({
      kind: "kind-mismatch";
      requestedKind: TargetSymbolKind;
      candidates: DisambiguationCandidateData[];
    } & TargetCandidateCompleteness)
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; message: string };
