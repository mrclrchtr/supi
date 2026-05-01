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
  /** Validate that a supported file can be read and parsed; does not expose the raw tree. */
  canParse(file: string): Promise<TreeSitterResult<{ file: string; language: string }>>;
  /** Run a Tree-sitter query and return all captures. */
  query(file: string, queryString: string): Promise<TreeSitterResult<QueryCapture[]>>;
  /** Extract top-level declarations plus supported class/interface/enum members. */
  outline(file: string): Promise<TreeSitterResult<OutlineItem[]>>;
  /** Extract static ES import declarations. */
  imports(file: string): Promise<TreeSitterResult<ImportRecord[]>>;
  /** Extract exported declarations, named exports, and re-exports. */
  exports(file: string): Promise<TreeSitterResult<ExportRecord[]>>;
  /** Return the smallest syntax node at a 1-based UTF-16 position. */
  nodeAt(file: string, line: number, character: number): Promise<TreeSitterResult<NodeAtResult>>;
  /** Release parser and grammar resources owned by this session. */
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
