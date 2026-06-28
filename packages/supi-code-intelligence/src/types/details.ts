import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata } from "../analysis/evidence.ts";
import type { PrioritySignalsSummary } from "../analysis/signals/project.ts";
import type { TestSurfaceDetails } from "../analysis/tests/test-discovery.ts";
import type { AnchorKind, TargetStoreEntry } from "../session/target-store.ts";

export type { TestSurfaceDetails } from "../analysis/tests/test-discovery.ts";

// ── Anchored coordinate resolution metadata ───────────────────────────

/**
 * Provider-backed evidence source that identified an anchored coordinate
 * target. Drives the markdown provenance note and structured resolution
 * metadata per ADR 0003/0004.
 *
 * - `semantic` — LSP document symbols identified the symbol and its anchors.
 * - `structural` — tree-sitter structural evidence (outline/exports/nodeAt)
 *   identified the declaration and/or identifier.
 * - `structural-identifier` — tree-sitter `nodeAt` classified the coordinate
 *   as an identifier token and snapped it to a declaration via ancestry.
 */
export type AnchoredResolutionSource = "semantic" | "structural" | "structural-identifier";

/**
 * Resolution metadata for a target resolved from anchored coordinates.
 *
 * Records the requested coordinate, the resolved anchor coordinate, whether
 * the resolved anchor differs from the request (a snap), and the
 * provider-backed evidence source. Structured details always carry this when
 * a target was resolved from coordinates; markdown surfaces a note only when
 * the resolution was non-obvious (snapped or degraded).
 */
export interface AnchoredResolutionMetadata {
  /** The 1-based coordinate the caller requested. */
  requested: { line: number; character: number };
  /** The 1-based anchor coordinate the target was resolved to. */
  resolved: { line: number; character: number };
  /** Whether the resolved anchor differs from the requested coordinate. */
  snapped: boolean;
  /** Provider-backed evidence source that identified the target. */
  source: AnchoredResolutionSource;
}

/** Structured details metadata returned alongside markdown brief content. */
export interface BriefDetails {
  confidence: ConfidenceMode;
  focusTarget: string | null;
  startHere: Array<{ target: string; reason: string }>;
  publicSurfaces: string[];
  dependencySummary: { moduleCount: number; edgeCount: number } | null;
  omittedCount: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
  prioritySignals?: PrioritySignalsSummary | null;
}

/** Structured details metadata for relationship and pattern results. */
export interface SearchDetails {
  confidence: ConfidenceMode;
  scope: string | null;
  candidateCount: number;
  omittedCount: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
  tests?: TestSurfaceDetails;
}

/** Structured details metadata for affected analysis results. */
export interface AffectedDetails {
  confidence: ConfidenceMode;
  directCount: number;
  downstreamCount: number;
  riskLevel: "low" | "medium" | "high";
  checkNext: string[];
  likelyTests: string[];
  /** Concrete test commands to run relevant verification. */
  likelyTestCommands: string[];
  omittedCount: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
  prioritySignals?: PrioritySignalsSummary | null;
  tests?: TestSurfaceDetails;
}

/**
 * Structured details metadata for workflow-oriented impact analysis results.
 *
 * Currently structurally identical to `AffectedDetails`. When adding own fields,
 * audit callers in `orchestrate.ts` that construct `{ type: "impact", data }`
 * so they return `ImpactDetails`, not just `AffectedDetails`.
 */
export interface ImpactDetails extends AffectedDetails {}

// Canonical disambiguation candidate — re-exported from resolution/types.ts
export type { DisambiguationCandidateData as DisambiguationCandidate } from "../analysis/target/types.ts";

/** Structured details metadata for code_resolve results. */
export interface ResolveDetails {
  confidence: ConfidenceMode;
  targetCount: number;
  omittedCount: number;
  evidenceLists?: EvidenceListMetadata[];
  /** Resolved targets with relative paths (computed from {@link TargetStoreEntry} at detail-build time). */
  targets: Array<{
    targetId: string;
    spanId: string;
    /** Workspace-relative path. */
    file: string;
    displayLine: number;
    displayCharacter: number;
    name: string | null;
    kind: string | null;
    anchorKind: AnchorKind;
    confidence: ConfidenceMode;
    provenance: string;
    /** Resolution provenance — present when the target was resolved from anchored coordinates. */
    resolution?: AnchoredResolutionMetadata;
  }>;
  /** Disambiguation candidates from the resolve service. */
  candidates?: Array<{
    targetId: string;
    name: string;
    kind: string | null;
    container: string | null;
    file: string;
    line: number;
    character: number;
    reason: string;
    rank: number;
    anchorKind: AnchorKind;
  }>;
  nextQueries: string[];
}

/** Structured details metadata for code_orientation results. */
export interface ContextDetails {
  confidence: ConfidenceMode;
  task: string | null;
  focusTarget: string | null;
  requestedSections: string[];
  renderedSections: string[];
  omittedCount: number;
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
  tests?: TestSurfaceDetails;
  /**
   * Resolved target store entry — populated for both coordinate and targetId
   * precise-target inputs. Absent for orientation/scope-only calls and for
   * ambiguous coordinate resolution (see `candidates`).
   * File paths are absolute; compute relative paths at render time.
   */
  target?: TargetStoreEntry;
  /**
   * Disambiguation candidates with targetIds — populated only when coordinate
   * resolution was ambiguous. No task sections are rendered in that case.
   */
  candidates?: Array<{
    targetId: string;
    name: string;
    kind: string | null;
    container: string | null;
    file: string;
    line: number;
    character: number;
    rank: number;
  }>;
}

/** Structured details metadata for code_inspect results. */
export interface InspectDetails {
  confidence: ConfidenceMode;
  focusTarget: string;
  unavailableSections: string[];
  evidenceLists?: EvidenceListMetadata[];
  nextQueries: string[];
}

/** Structured details metadata for code_health results. */
export interface HealthDetails {
  lspAvailable: boolean;
  lspStatus: string;
  recovered: boolean;
  /** Structural (tree-sitter) substrate readiness. Undefined when not evaluated. */
  structuralStatus?: string;
  diagnosticFileCount: number;
  serverCount: number;
  evidenceLists?: EvidenceListMetadata[];
}
