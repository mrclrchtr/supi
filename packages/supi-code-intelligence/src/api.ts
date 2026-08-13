// Public type surface for @mrclrchtr/supi-code-intelligence.
// Types only — no implementation exports.

// Provider contracts and shared canonical types from the shared runtime.
export type {
  CalleesData,
  CapabilityState,
  CodeLocation,
  CodePosition,
  CodeQueryResult,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  SemanticProvider,
  SemanticProvider as SemanticSubstrate,
  SourceRange,
  StructuralProvider,
  StructuralProvider as StructuralSubstrate,
  StructuralResult,
} from "@mrclrchtr/supi-code-runtime/api";
// Architecture model types.
export type {
  ArchitectureModel,
  ArchitectureObservationStatus,
  DependencyEdge,
  ManifestDependency,
  ManifestDependencyField,
  ManifestDependencySection,
  ManifestField,
  ModuleInfo,
  PackageManifestObservation,
  WorkspaceTopology,
  WorkspaceTopologySource,
} from "./analysis/architecture/model.ts";
// Code provider types.
export type { CodeProvider, CodeProviderState } from "./analysis/provider.ts";
// Target resolution types.
export type {
  ResolvedTargetData,
  ResolvedTargetGroupData,
  TargetOutcome,
  TargetProviderProvenance,
} from "./analysis/target/types.ts";
export type {
  HealthDiagnosticObservation,
  HealthDiagnosticScope,
  HealthRefreshAttempt,
  HealthRefreshState,
  HealthStaleAssessment,
  SemanticHealthState,
} from "./session/health-types.ts";
export type { TargetSymbolKind } from "./session/target-input.ts";
// Code-intelligence-specific result types.
export type {
  CodeIntelResult,
  CodeIntelResultDetails,
  ContextDetails,
  DisambiguationCandidate,
  HealthDetails,
  HealthSectionDetails,
  InspectDetails,
  OrientationSectionDetails,
  ResolveDetails,
  SearchDetails,
  ToolDisplaySection,
  ToolOutputTruncationDetails,
  ToolResultStatus,
} from "./types/index.ts";
