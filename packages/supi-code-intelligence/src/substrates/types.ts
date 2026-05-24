// Substrate interfaces and value types for code-intelligence's
// semantic (LSP) and structural (tree-sitter) adapters.
//
// Interfaces are consumer-side: supi-code-intelligence defines what it needs.
// Concrete adapters wrap supi-lsp / supi-tree-sitter and map their types.

import type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/api";

// ── Discriminated result union (mirrors TreeSitterResult, package-agnostic) ──

export type StructuralResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string };

// ── Flat value types (normalized from tree-sitter nested range shapes) ──

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

export interface CodeSymbol {
  name: string;
  kind: string;
  file: string;
  /** 1-based display line. */
  line: number;
  /** 1-based display character. */
  character: number;
  container?: string | null;
}

// ── Substrate interfaces ──────────────────────────────────────────────

/** Semantic (LSP-backed) code analysis operations. */
export interface SemanticSubstrate {
  /** Find all references to a symbol at the given position. */
  references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;

  /** Find implementations of a symbol at the given position. */
  implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;

  /** Get document-level symbols for a file. */
  documentSymbols(filePath: string): Promise<CodeSymbol[] | null>;

  /** Search workspace symbols by name. */
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;
}

/** Structural (tree-sitter-backed) code analysis operations. */
export interface StructuralSubstrate {
  /** Extract outgoing calls from the enclosing scope at a position. */
  calleesAt(file: string, line: number, character: number): Promise<StructuralResult<CalleesData>>;

  /** Extract exported declarations from a file. */
  exports(file: string): Promise<StructuralResult<ExportData[]>>;

  /** Extract top-level declarations from a file. */
  outline(file: string): Promise<StructuralResult<OutlineData[]>>;

  /** Extract import declarations from a file. */
  imports(file: string): Promise<StructuralResult<ImportData[]>>;

  /** Get the syntax node at a 1-based position. */
  nodeAt(file: string, line: number, character: number): Promise<StructuralResult<NodeAtData>>;
}
