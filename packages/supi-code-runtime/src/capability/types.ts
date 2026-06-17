/**
 * Capability interfaces and availability states for the code-understanding
 * stack. These define the contracts through which substrates (LSP,
 * tree-sitter) advertise what they can do.
 */

import type {
  CalleesData,
  CallSite,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
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

/**
 * Semantic analysis capability backed by a language server (LSP).
 *
 * Methods return `null` to signal absence (unavailable / inactive) and
 * an array to signal a successful query (possibly empty).
 */
export interface SemanticProvider {
  references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  documentSymbols(filePath: string): Promise<CodeSymbol[] | null>;
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;

  /**
   * Optional definition capability. Returns the definition location(s) for
   * the symbol at the given position. When the provider cannot produce
   * definition info, returns `null`.
   */
  definition?(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;

  /**
   * Optional hover capability. Returns a simplified type/signature info
   * shape that does not depend on vscode-languageserver-types. When the
   * provider cannot produce hover info (unavailable, unsupported file,
   * no result at the given position), returns `null`.
   */
  hover?(
    filePath: string,
    position: CodePosition,
  ): Promise<{ contents: string; range?: SourceRange } | null>;

  /**
   * Optional operation-aware refactor capability.
   *
   * This is the preferred planning entrypoint for higher-level tools because it
   * lets the provider choose the honest substrate path per operation (rename,
   * organize imports, dead-code cleanup, etc.) without exposing that branching
   * to callers.
   */
  refactor?(request: RefactorRequest): Promise<RefactorResult>;

  /**
   * Optional rename capability. When present, the provider supports
   * precise semantic symbol-rename operations.
   *
   * Kept as a low-level substrate helper for compatibility while the public
   * tool surface still exposes a legacy `rename` alias.
   */
  rename?(file: string, position: CodePosition, newName: string): Promise<RefactorResult>;

  /**
   * Optional code actions capability. When present, the provider
   * supports code-action-based refactors.
   *
   * Kept as a low-level substrate helper and for lightweight introspection.
   */
  codeActions?(file: string, position: CodePosition): Promise<RefactorResult[]>;

  /**
   * Optional lightweight code action titles for display purposes.
   * Returns simplified title/kind pairs at the given position.
   * When the provider cannot produce code actions, returns `null`.
   */
  codeActionTitles?(
    file: string,
    position: CodePosition,
  ): Promise<Array<{ title: string; kind?: string }> | null>;
}

/**
 * Structural analysis capability backed by a parser (tree-sitter).
 *
 * Methods return a discriminated `CodeResult` union that explicitly encodes
 * success, unsupported-language, file-access error, validation error,
 * and runtime error states.
 */
export interface StructuralProvider {
  calleesAt(file: string, line: number, character: number): Promise<CodeResult<CalleesData>>;
  exports(file: string): Promise<CodeResult<ExportData[]>>;
  outline(file: string): Promise<CodeResult<OutlineData[]>>;
  imports(file: string): Promise<CodeResult<ImportData[]>>;
  nodeAt(file: string, line: number, character: number): Promise<CodeResult<NodeAtData>>;
  /** Find all call-site identifiers in a file. Returns name + start line for each match. */
  callSites(file: string): Promise<CodeResult<CallSite[]>>;
}

/** Convenience alias for `CodeResult` used in structural contexts. */
export type StructuralResult<T> = CodeResult<T>;
