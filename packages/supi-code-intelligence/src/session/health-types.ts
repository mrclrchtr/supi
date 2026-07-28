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
  readonly scopeFilter: string | null;
  readonly level: "summary" | "detailed";
  readonly capabilityWarnings?: CapabilityWarningReport;
  readonly diagnosticAgeSeconds?: number;
}

export type HealthWorkflowOutcome =
  | { readonly kind: "completed"; readonly data: HealthData }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "unavailable"; readonly reason: string };
