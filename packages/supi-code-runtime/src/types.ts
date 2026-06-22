/**
 * Canonical shared types for the SuPi code-understanding stack.
 *
 * These types are package-agnostic and used across supi-lsp, supi-tree-sitter,
 * and supi-code-intelligence for communicating code analysis results,
 * capability availability, and structural data shapes.
 */

// ── Position and location types ────────────────────────────────────────

/** 0-based LSP position. */
export interface CodePosition {
  line: number;
  character: number;
}

/** A source range spanning two CodePositions. */
export interface SourceRange {
  start: CodePosition;
  end: CodePosition;
}

/** A code location (file URI + range). */
export interface CodeLocation {
  uri: string;
  range: SourceRange;
}

// ── Symbol types ───────────────────────────────────────────────────────

/** A discovered symbol / declaration. */
export interface CodeSymbol {
  name: string;
  kind: string;
  file: string;
  line: number;
  character: number;
  container?: string | null;
}

// ── Result types ───────────────────────────────────────────────────────

/**
 * Discriminated result union for provider operations.
 *
 * Used primarily by structural (tree-sitter-backed) operations that
 * have explicit error and unsupported-language states. Semantic operations
 * use `null` to signal absence.
 */
export type CodeResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string }
  | { kind: "unavailable"; message: string };

/** Result confidence classification. */
export type ConfidenceMode = "semantic" | "structural" | "heuristic" | "unavailable";

// ── Structural data shapes (value types, range-flattened) ──────────────

export interface OutlineData {
  name: string;
  kind: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  children?: OutlineData[];
}

export interface ExportData {
  name: string;
  kind: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  moduleSpecifier?: string;
}

export interface ImportData {
  moduleSpecifier: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface NodeAtData {
  type: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
  ancestry: Array<{
    type: string;
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  }>;
}

// ── Refactor types ───────────────────────────────────────────────────

/**
 * A single file edit within a workspace edit.
 */
export interface FileEdit {
  /** Absolute file path */
  file: string;
  /** The source range to replace */
  range: SourceRange;
  /** The new text to insert */
  newText: string;
}

/**
 * A precise workspace edit — one or more file edits to apply atomically.
 */
export interface WorkspaceEdit {
  edits: FileEdit[];
}

/**
 * Supported refactor operation names for the current semantic planning path.
 *
 * `rename` is kept as a legacy alias for the public rename-only surface.
 */
export type RefactorOperation =
  | "rename"
  | "rename_symbol"
  | "extract_function"
  | "extract_variable"
  | "rename_file"
  | "move_file"
  | "update_imports"
  | "delete_dead_code";

/** Normalize legacy refactor aliases to their canonical operation names. */
export function normalizeRefactorOperation(
  operation: RefactorOperation,
): Exclude<RefactorOperation, "rename"> {
  return operation === "rename" ? "rename_symbol" : operation;
}

/**
 * Operation-aware refactor planning request.
 *
 * Consumers provide a target file/position plus operation-specific options.
 * File/resource operations remain requestable so providers can reject them
 * explicitly and honestly until shared workspace-edit resource ops exist.
 */
export interface RefactorRequest {
  operation: RefactorOperation;
  file: string;
  position: CodePosition;
  range?: SourceRange;
  newName?: string;
  destination?: string;
}

/**
 * A disambiguation candidate when a refactor target is ambiguous.
 */
export interface DisambiguationCandidate {
  description: string;
  file?: string;
  line?: number;
  character?: number;
}

/**
 * Result of a refactor operation.
 *
 * - `precise`: exact edits available for safe direct apply
 * - `ambiguous`: multiple candidates, caller must disambiguate
 * - `unavailable`: refactoring not possible
 */
export type RefactorResult =
  | { kind: "precise"; edits: WorkspaceEdit }
  | { kind: "ambiguous"; candidates: DisambiguationCandidate[] }
  | { kind: "unavailable"; reason: string };

// ── Structural data shapes (value types, range-flattened) ──────────────

export interface CalleesData {
  enclosingScope: { name: string; startLine: number; endLine: number };
  callees: Array<{ name: string; startLine: number }>;
}

/** A single call-site match with name and start line. */
export interface CallSite {
  name: string;
  startLine: number;
}
