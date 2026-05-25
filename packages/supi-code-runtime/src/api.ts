// Public API surface for supi-code-runtime.
// Canonical types and provider contracts — fleshed out in later tasks.

export type {
  ArchitectureModel,
  DependencyEdge,
  ModuleInfo,
} from "./project/model.ts";
export {
  buildArchitectureModel,
  findModuleForPath,
  getDependencies,
  getDependents,
} from "./project/model.ts";
export type {
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "./provider/types.ts";
export { createSessionStateRegistry } from "./session/service-registry.ts";
export {
  createWorkspaceContext,
  type WorkspaceContext,
} from "./session/workspace-session.ts";
export type {
  CalleesData,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  ProviderAvailability,
  SourceRange,
} from "./types.ts";
