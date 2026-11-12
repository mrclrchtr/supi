/**
 * Public API surface for @mrclrchtr/supi-code-runtime.
 *
 * This package exports shared canonical types, capability interfaces,
 * and workspace runtime primitives.
 * It is a library-only package with no pi extension entrypoint.
 */

// Capability interfaces and availability states
export type {
  CapabilityState,
  CodeRequestControl,
  SemanticProvider,
  StructuralProvider,
  StructuralResult,
} from "./capability/types.ts";
export { childDeclarationLevel } from "./declaration-level.ts";
export type {
  CFamilyExtension,
  CFamilyFileAssociationResolver,
  CFamilyFileAssociationRule,
  CFamilyLanguage,
} from "./file-associations.ts";
export {
  C_FAMILY_EXTENSIONS,
  createCFamilyFileAssociationResolver,
  defaultCFamilyLanguage,
} from "./file-associations.ts";
export type { CodeQueryPartialMetadata, CodeQueryResult } from "./query-result.ts";
// Shared query-result constructors and contract
export {
  completedCodeQuery,
  mapCodeQueryResult,
  partialCodeQuery,
  unavailableCodeQuery,
} from "./query-result.ts";
export {
  CodeRequestDeadlineError,
  isCodeRequestDeadlineError,
  isCodeRequestInterrupted,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "./request-control.ts";
// Shared canonical types
export type {
  CalleeDepth,
  CalleesData,
  CallSite,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ConfidenceMode,
  DeclarationLevel,
  DisambiguationCandidate,
  DocumentCodeSymbol,
  DocumentEditPrecondition,
  ExportData,
  FileEdit,
  ImportData,
  NodeAtData,
  OutlineData,
  RefactorActionIdentity,
  RefactorOperation,
  RefactorRequest,
  RefactorResult,
  SourceRange,
  WorkspaceEdit,
} from "./types.ts";
export type { WorkspaceCapabilities } from "./workspace/runtime.ts";
// Workspace runtime
export { getDefaultWorkspaceRuntime, WorkspaceRuntime } from "./workspace/runtime.ts";
