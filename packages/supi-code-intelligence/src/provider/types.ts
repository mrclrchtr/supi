// Provider contract interfaces for semantic (LSP-backed) and
// structural (tree-sitter-backed) code analysis substrates.

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
} from "../types.ts";

/** Semantic (LSP-backed) provider. */
export interface SemanticProvider {
  references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null>;
  documentSymbols(filePath: string): Promise<CodeSymbol[] | null>;
  workspaceSymbols(query: string): Promise<CodeSymbol[] | null>;
}

/** Structural (tree-sitter-backed) provider. */
export interface StructuralProvider {
  calleesAt(file: string, line: number, character: number): Promise<CodeResult<CalleesData>>;
  exports(file: string): Promise<CodeResult<ExportData[]>>;
  outline(file: string): Promise<CodeResult<OutlineData[]>>;
  imports(file: string): Promise<CodeResult<ImportData[]>>;
  nodeAt(file: string, line: number, character: number): Promise<CodeResult<NodeAtData>>;
}

/** Re-export CodeResult as StructuralResult for convenience. */
export type StructuralResult<T> = CodeResult<T>;
