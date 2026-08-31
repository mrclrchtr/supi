import type {
  DiagnosticEvidenceSummary,
  FileScopeDecision,
  ProcessCrashRecoverySummary,
  ProjectServerInfo,
  ProjectServerStatusReason,
} from "@mrclrchtr/supi-lsp/api";
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
  readonly status: ProjectServerInfo["status"];
  readonly statusReason?: ProjectServerStatusReason;
  readonly ready: boolean;
}

/** A single diagnostic message extracted for detailed health output. */
export interface HealthDiagnosticMessage {
  readonly line: number;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly source?: string;
}

export interface HealthDiagnosticEntry {
  readonly file: string;
  readonly errors: number;
  readonly warnings: number;
  /** Individual messages, present only in detailed mode. Capped per file. */
  readonly messages?: readonly HealthDiagnosticMessage[];
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
      readonly evidence: DiagnosticEvidenceSummary;
      /** Tsconfig scope decision for the requested file (file scope only). */
      readonly scopeStatus?: FileScopeDecision;
    }
  | {
      readonly kind: "partial";
      readonly scope: HealthDiagnosticScope;
      readonly entries: readonly HealthDiagnosticEntry[];
      readonly evidence: DiagnosticEvidenceSummary;
      readonly reason: string;
      /** Tsconfig scope decision for the requested file (file scope only). */
      readonly scopeStatus?: FileScopeDecision;
    }
  | {
      readonly kind: "unavailable";
      readonly scope: HealthDiagnosticScope;
      readonly entries: readonly HealthDiagnosticEntry[];
      readonly evidence: DiagnosticEvidenceSummary;
      readonly reason: string;
      /** Tsconfig scope decision for the requested file (file scope only). */
      readonly scopeStatus?: FileScopeDecision;
    };

/** Bounded stale-diagnostic metadata from one refresh attempt. */
export interface HealthStaleAssessment {
  readonly scope: "file" | "workspace";
  readonly suspected: boolean | null;
  readonly matchedFileCount: number;
  readonly warning: string | null;
}

export type HealthRefreshOperationScope = "file-runtime" | "workspace-runtime";

/** Shared facts for one completed refresh or file-maintenance attempt. */
interface CompletedHealthRefreshAttempt {
  readonly kind: "completed";
  readonly attemptedAt: number;
  /** Wall-clock duration of the attempt, for telemetry. */
  readonly elapsedMs: number;
  /** The diagnostic evidence scope requested by the caller, not the runtime operation scope. */
  readonly requestedDiagnosticScope: HealthDiagnosticScope;
  /** Active clients targeted by the best-effort operation; this is not a confirmed-success count. */
  readonly attemptedActiveClients: number;
  /** Clients restarted by stale-diagnostic recovery. */
  readonly restartedClients: number;
  /** Separate outcome for process-crash route recovery. */
  readonly processCrashRecovery: ProcessCrashRecoverySummary;
  readonly staleAssessment: HealthStaleAssessment;
}

/** A diagnostic refresh attempt against an explicit LSP runtime scope. */
export type HealthRefreshAttempt =
  | (CompletedHealthRefreshAttempt & {
      readonly operationScope: "workspace-runtime";
      /** Final document-level evidence from the refresh or recovery pass. */
      readonly diagnosticEvidence: DiagnosticEvidenceSummary;
    })
  | (CompletedHealthRefreshAttempt & {
      /** File maintenance does not claim a workspace diagnostic refresh. */
      readonly operationScope: "file-runtime";
    })
  | {
      readonly kind: "failed";
      readonly attemptedAt: number;
      /** Wall-clock duration of the attempt, for telemetry. */
      readonly elapsedMs: number;
      readonly requestedDiagnosticScope: HealthDiagnosticScope;
      readonly operationScope: HealthRefreshOperationScope;
      /** Active clients targeted before the operation failed, when available. */
      readonly attemptedActiveClients?: number;
      /** Clients restarted by stale-diagnostic recovery, when available. */
      readonly restartedClients?: number;
      /** Stale-diagnostic assessment, when the recovery pass returned one. */
      readonly staleAssessment?: HealthStaleAssessment;
      /** Evidence collected before the operation failed, when available. */
      readonly diagnosticEvidence?: DiagnosticEvidenceSummary;
      /** Process-crash outcome, when the recovery pass returned one. */
      readonly processCrashRecovery?: ProcessCrashRecoverySummary;
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
