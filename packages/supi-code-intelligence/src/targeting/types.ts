/**
 * Targeting types — normalized query and typed outcomes for the
 * target-resolution pipeline.
 *
 * These types decouple request normalization from resolution implementation
 * and keep action-facing code focused on routing, not string building.
 */

import type {
  SemanticProvider as SemanticSubstrate,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import type { AnchorKind } from "../workflow/target-store.ts";

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
  name: string | null;
  kind: string | null;
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
  /** Which anchor this target carries — drives strict-consumer enforcement (ADR 0003). */
  anchorKind: AnchorKind;
  /** Symbolic container (class/namespace/module name), or null for top-level. */
  container: string | null;
  /**
   * Resolution provenance — present when the target was resolved from
   * anchored coordinates. Carries requested/resolved coordinates, whether the
   * anchor was snapped, and the provider-backed evidence source.
   */
  resolution?: import("../types.ts").AnchoredResolutionMetadata;
}

/**
 * A file-level target group with one or more discoverable targets.
 */
export interface ResolvedTargetGroupData {
  file: string;
  displayName: string;
  targets: ResolvedTargetData[];
  confidence: "semantic" | "structural" | "heuristic" | "unavailable";
}

/**
 * A disambiguation candidate for symbol searches with multiple matches.
 */
export interface DisambiguationCandidateData {
  name: string;
  kind: string | null;
  container: string | null;
  file: string;
  line: number;
  character: number;
  reason: string;
  rank: number;
  /** Which anchor this candidate carries (ADR 0003). */
  anchorKind: AnchorKind;
}

/**
 * Typed outcome of a resolution attempt.
 *
 * Actions consume these to produce user-facing strings/details;
 * the resolution pipeline itself stays presentation-agnostic.
 */
export type TargetOutcome =
  | { kind: "resolved"; target: ResolvedTargetData }
  | { kind: "group"; group: ResolvedTargetGroupData }
  | {
      kind: "disambiguation";
      candidates: DisambiguationCandidateData[];
      omittedCount: number;
    }
  | { kind: "error"; message: string };
