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

export interface CalleesData {
  enclosingScope: { name: string; startLine: number; endLine: number };
  callees: Array<{ name: string; startLine: number }>;
}
