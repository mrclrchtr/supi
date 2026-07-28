import type { CapabilityWarningReport } from "../analysis/capability/capability-warnings.ts";

export type HealthSection = "diagnostics" | "servers";

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

/** The evidence boundary for diagnostics collected by one health request. */
export type HealthDiagnosticScope =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "tracked-files"; readonly filter: string | null };

/** A diagnostic observation that preserves completed-empty, partial, and unavailable states. */
export type HealthDiagnosticObservation =
  | { readonly kind: "not-requested"; readonly entries: readonly HealthDiagnosticEntry[] }
  | {
      readonly kind: "completed";
      readonly scope: HealthDiagnosticScope;
      readonly entries: readonly HealthDiagnosticEntry[];
    }
  | {
      readonly kind: "partial";
      readonly scope: HealthDiagnosticScope;
      readonly entries: readonly HealthDiagnosticEntry[];
      readonly reason: string;
    }
  | {
      readonly kind: "unavailable";
      readonly scope: HealthDiagnosticScope;
      readonly entries: readonly HealthDiagnosticEntry[];
      readonly reason: string;
    };

/** Bounded stale-diagnostic metadata from a completed workspace recovery pass. */
export interface HealthStaleAssessment {
  readonly suspected: boolean;
  readonly matchedFileCount: number;
  readonly warning: string | null;
}

/** A diagnostic refresh attempt against the workspace LSP runtime. */
export type HealthRefreshAttempt =
  | {
      readonly kind: "completed";
      readonly attemptedAt: number;
      /** The diagnostic evidence scope requested by the caller, not the runtime operation scope. */
      readonly requestedDiagnosticScope: HealthDiagnosticScope;
      /** Recovery always operates against the workspace runtime. */
      readonly operationScope: "workspace-runtime";
      /** Active clients targeted by the best-effort refresh; this is not a confirmed-success count. */
      readonly attemptedActiveClients: number;
      readonly restartedClients: number;
      readonly staleAssessment: HealthStaleAssessment;
    }
  | {
      readonly kind: "failed";
      readonly attemptedAt: number;
      readonly requestedDiagnosticScope: HealthDiagnosticScope;
      readonly operationScope: "workspace-runtime";
      readonly reason: string;
    };

/** Refresh state for this health call, retaining the prior actual attempt when none ran. */
export type HealthRefreshState =
  | HealthRefreshAttempt
  | {
      readonly kind: "not-requested";
      readonly reason: string;
      readonly lastAttempt: HealthRefreshAttempt | null;
    }
  | {
      readonly kind: "not-attempted";
      readonly reason: string;
      readonly lastAttempt: HealthRefreshAttempt | null;
    };

/** Presentation-neutral health facts. */
export interface HealthData {
  readonly includedSections: readonly HealthSection[];
  /** Final semantic state, or null when no semantic health section was requested. */
  readonly semanticState: SemanticHealthState | null;
  /** Whether server inventory was observed from a live owner or explicit disabled state. */
  readonly serverInventoryAvailable: boolean;
  /** True only when the structural capability is explicitly ready. */
  readonly structuralAvailable?: boolean;
  readonly structuralStatus?: string;
  readonly diagnostics: HealthDiagnosticObservation;
  /** Server inventory is always workspace-wide, independent of diagnostic scope. */
  readonly servers: readonly HealthServerInfo[];
  readonly refresh: HealthRefreshState;
  readonly level: "summary" | "detailed";
  readonly capabilityWarnings?: CapabilityWarningReport;
}

export type HealthWorkflowOutcome =
  | { readonly kind: "completed"; readonly data: HealthData }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
