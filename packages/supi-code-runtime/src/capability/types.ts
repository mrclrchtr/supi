/**
 * Capability interfaces and availability states for the code-understanding
 * stack. These define the contracts through which substrates (LSP,
 * tree-sitter) advertise what they can do.
 */

import type { CodeQueryResult } from "../query-result.ts";
import type {
  CalleeDepth,
  CalleesData,
  CallSite,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  DocumentCodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  RefactorRequest,
  RefactorResult,
  SourceRange,
} from "../types.ts";

// ── Availability state ─────────────────────────────────────────────────

/**
 * Availability state for a capability within a workspace.
 *
 * - `pending`: the capability may become ready soon (e.g., server starting)
 * - `ready`: the capability is active and can be used
 * - `inactive`: the capability exists but is intentionally turned off
 * - `disabled`: the capability is unavailable for workspace-specific reasons
 * - `unavailable`: the capability cannot be provided at all
 */
export type CapabilityState =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "inactive" }
  | { kind: "disabled" }
  | { kind: "unavailable"; reason: string };

// ── Provider interfaces ────────────────────────────────────────────────

/** Request control that adapters preserve and cooperative providers apply. */
export interface CodeRequestControl {
  /** Opaque Debug Operation ID for work directly owned by one public Tool call. */
  readonly operationId?: string;
  /** Caller cancellation signal, when one exists. */
  readonly signal?: AbortSignal;
  /** Absolute wall-clock deadline in Unix epoch milliseconds. */
  readonly deadline?: number;
}

/**
 * Semantic analysis capability backed by a language server (LSP).
 *
 * Every read query preserves whether collection completed, completed only
 * partially, or was unavailable. Successful empty arrays and protocol-level
 * null values are completed observations rather than capability failures.
 */
export interface SemanticProvider {
  references(
    filePath: string,
    position: CodePosition,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<CodeLocation[]>>;
  implementation(
    filePath: string,
    position: CodePosition,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<CodeLocation[]>>;
  documentSymbols(
    filePath: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<DocumentCodeSymbol[]>>;
  workspaceSymbols(
    query: string,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<CodeSymbol[]>>;

  /** Optional definition capability with explicit completed-empty semantics. */
  definition?(
    filePath: string,
    position: CodePosition,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<CodeLocation[]>>;

  /**
   * Optional hover capability. A completed `null` data value means the
   * provider successfully found no hover at the requested point.
   */
  hover?(
    filePath: string,
    position: CodePosition,
    control?: CodeRequestControl,
  ): Promise<CodeQueryResult<{ contents: string; range?: SourceRange } | null>>;

  /**
   * Optional operation-aware refactor capability.
   *
   * This is the preferred planning entrypoint for higher-level tools because it
   * lets the provider choose the honest substrate path per operation (rename,
   * organize imports, dead-code cleanup, etc.) without exposing that branching
   * to callers.
   */
  refactor?(request: RefactorRequest, control?: CodeRequestControl): Promise<RefactorResult>;

  /**
   * Optional rename capability. When present, the provider supports
   * precise semantic symbol-rename operations.
   *
   * This remains a lower-level substrate helper for providers that expose
   * symbol rename independently of their general refactor planner.
   */
  rename?(
    file: string,
    position: CodePosition,
    newName: string,
    control?: CodeRequestControl,
  ): Promise<RefactorResult>;

  /**
   * Optional code actions capability. When present, the provider
   * supports code-action-based refactors.
   *
   * Kept as a low-level substrate helper and for lightweight introspection.
   */
  codeActions?(
    file: string,
    position: CodePosition,
    control?: CodeRequestControl,
  ): Promise<RefactorResult[]>;
}

/**
 * Structural analysis capability backed by a parser (tree-sitter).
 *
 * Methods return a discriminated `CodeResult` union that explicitly encodes
 * success, unsupported-language, file-access error, validation error,
 * and runtime error states.
 */
export interface StructuralProvider {
  calleesAt(
    file: string,
    line: number,
    character: number,
    depthOrOptions?: CalleeDepth | { depth?: CalleeDepth; control?: CodeRequestControl },
  ): Promise<CodeResult<CalleesData>>;
  exports(file: string, control?: CodeRequestControl): Promise<CodeResult<ExportData[]>>;
  outline(file: string, control?: CodeRequestControl): Promise<CodeResult<OutlineData[]>>;
  imports(file: string, control?: CodeRequestControl): Promise<CodeResult<ImportData[]>>;
  nodeAt(
    file: string,
    line: number,
    character: number,
    control?: CodeRequestControl,
  ): Promise<CodeResult<NodeAtData>>;
  /** Find all call-site identifiers in a file. Returns name + start line for each match. */
  callSites(file: string, control?: CodeRequestControl): Promise<CodeResult<CallSite[]>>;
}

/** Convenience alias for `CodeResult` used in structural contexts. */
export type StructuralResult<T> = CodeResult<T>;
