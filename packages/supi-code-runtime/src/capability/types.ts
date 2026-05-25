/**
 * Capability interfaces and availability states for the code-understanding
 * stack. These define the contracts through which substrates (LSP,
 * tree-sitter) advertise what they can do.
 */

import type {
  CalleesData,
  CodeLocation,
  CodePosition,
  CodeResult,
  CodeSymbol,
  ExportData,
  ImportData,
  NodeAtData,
  OutlineData,
  RefactorResult,
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
   * Optional rename capability. When present, the provider supports
   * precise semantic rename operations.
   */
  rename?(file: string, position: CodePosition, newName: string): Promise<RefactorResult>;

  /**
   * Optional code actions capability. When present, the provider
   * supports code-action-based refactors.
   */
  codeActions?(file: string, position: CodePosition): Promise<RefactorResult[]>;
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
}

/** Convenience alias for `CodeResult` used in structural contexts. */
export type StructuralResult<T> = CodeResult<T>;
