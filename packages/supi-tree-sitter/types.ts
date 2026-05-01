// Public types for @mrclrchtr/supi-tree-sitter

/** 1-based source range compatible with LSP position convention. */
export interface SourceRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

/** Discriminated result union for all service operations. */
export type TreeSitterResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string };

/** Structural outline item. */
export interface OutlineItem {
  name: string;
  kind: string;
  range: SourceRange;
  children?: OutlineItem[];
}

/** Import record. */
export interface ImportRecord {
  moduleSpecifier: string;
  range: SourceRange;
}

/** Export record. */
export interface ExportRecord {
  name: string;
  kind: string;
  range: SourceRange;
  moduleSpecifier?: string;
}

/** Node-at-position result. */
export interface NodeAtResult {
  type: string;
  range: SourceRange;
  text: string;
  ancestry: Array<{ type: string; range: SourceRange }>;
}

/** Query capture result. */
export interface QueryCapture {
  name: string;
  nodeType: string;
  range: SourceRange;
  text: string;
}

/** Session-level Tree-sitter service. */
export interface TreeSitterSession {
  parse(file: string): Promise<TreeSitterResult<{ file: string; language: string }>>;
  query(file: string, queryString: string): Promise<TreeSitterResult<QueryCapture[]>>;
  outline(file: string): Promise<TreeSitterResult<OutlineItem[]>>;
  imports(file: string): Promise<TreeSitterResult<ImportRecord[]>>;
  exports(file: string): Promise<TreeSitterResult<ExportRecord[]>>;
  nodeAt(file: string, line: number, character: number): Promise<TreeSitterResult<NodeAtResult>>;
  dispose(): void;
}

/** Supported grammar identifiers. */
export type GrammarId = "javascript" | "typescript" | "tsx";

/** Supported file extension. */
export type SupportedExtension =
  | ".ts"
  | ".tsx"
  | ".js"
  | ".jsx"
  | ".mts"
  | ".cts"
  | ".mjs"
  | ".cjs";
