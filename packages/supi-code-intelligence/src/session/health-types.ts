import type { CoverageWarningReport } from "../analysis/coverage/coverage-warnings.ts";
import type { EvidenceListMetadata } from "../analysis/evidence.ts";
import type { GitContext } from "../analysis/signals/git.ts";

export type HealthSection = "diagnostics" | "servers" | "dirty" | "coverage" | "unused";

/** Final semantic-diagnostics readiness after routing and requested recovery. */
export type SemanticHealthState =
  | { readonly kind: "ready" }
  | { readonly kind: "pending"; readonly reason: string }
  | { readonly kind: "inactive"; readonly reason: string }
  | { readonly kind: "disabled"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface HealthWorkflowInput {
  readonly scope?: string;
  readonly refresh?: boolean;
  readonly include?: readonly HealthSection[];
  readonly level?: "summary" | "detailed";
  readonly coveragePath?: string;
  readonly unusedPath?: string;
}

export interface HealthServerInfo {
  readonly name: string;
  readonly root: string;
  readonly fileTypes: readonly string[];
  readonly status: string;
  readonly ready: boolean;
}

export interface HealthDiagnosticEntry {
  readonly file: string;
  readonly errors: number;
  readonly warnings: number;
}

export interface HealthCoverageData {
  /** Exact report locator that was checked. */
  readonly reportPath: string;
  readonly available: boolean;
  readonly entries: ReadonlyArray<{ file: string; pct: number }>;
}

export interface HealthUnusedData {
  /** Exact report locator that was checked. */
  readonly reportPath: string;
  readonly available: boolean;
  readonly files: readonly string[];
  readonly exports: ReadonlyArray<{ file: string; name: string }>;
}

export interface CodeActionSuggestion {
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly kind?: string;
}

/** Bounded advisory code-action list with explicit completeness metadata. */
export interface HealthCodeActions {
  readonly items: readonly CodeActionSuggestion[];
  readonly evidence: EvidenceListMetadata;
}

/** Presentation-neutral health facts. */
export interface HealthData {
  readonly includedSections: readonly HealthSection[];
  /** Final semantic state, or null when no semantic health section was requested. */
  readonly semanticState: SemanticHealthState | null;
  /** Whether server inventory was observed from a live owner or explicit disabled state. */
  readonly serverInventoryAvailable: boolean;
  readonly recovered: boolean;
  /** True only when the structural capability is explicitly ready. */
  readonly structuralAvailable?: boolean;
  readonly structuralStatus?: string;
  readonly diagnostics: readonly HealthDiagnosticEntry[];
  readonly servers: readonly HealthServerInfo[];
  readonly gitContext: GitContext | null;
  readonly scopeFilter: string | null;
  readonly level: "summary" | "detailed";
  readonly codeActions: HealthCodeActions | null;
  readonly coverage: HealthCoverageData | null;
  readonly unused: HealthUnusedData | null;
  readonly degradedCoverage?: CoverageWarningReport;
  readonly diagnosticAgeSeconds?: number;
}

export type HealthWorkflowOutcome =
  | { readonly kind: "completed"; readonly data: HealthData }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
