// Public tree-sitter package types.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";

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

/** Result from structural callee extraction. */
export interface CalleesAtResult {
  enclosingScope: {
    name: string;
    range: SourceRange;
  };
  callees: Array<{
    name: string;
    range: SourceRange;
  }>;
  depth: "direct" | "deep";
}

/** Query capture result. */
export interface QueryCapture {
  name: string;
  nodeType: string;
  range: SourceRange;
  text: string;
}

/** A single call-site match from tree-sitter analysis. */
export interface CallSiteMatch {
  name: string;
  startLine: number;
}

/**
 * Shared Tree-sitter service surface, independent of lifecycle ownership.
 * Optional request control cooperatively stops reads, parser progress, query
 * progress, and cache publication without exposing raw WASM resources.
 */
export interface TreeSitterService {
  /** Validate that a supported file can be read and parsed; does not expose the raw tree. */
  canParse(
    file: string,
    control?: CodeRequestControl,
  ): Promise<TreeSitterResult<{ file: string; language: string }>>;
  /** Run a Tree-sitter query and return all captures. */
  query(
    file: string,
    queryString: string,
    control?: CodeRequestControl,
  ): Promise<TreeSitterResult<QueryCapture[]>>;
  /**
   * Extract shallow declarations, including supported nested code members,
   * HTML ids, and SQL schema members.
   */
  outline(file: string, control?: CodeRequestControl): Promise<TreeSitterResult<OutlineItem[]>>;
  /** Extract static ES import declarations. */
  imports(file: string, control?: CodeRequestControl): Promise<TreeSitterResult<ImportRecord[]>>;
  /** Extract exported declarations, named exports, re-exports, and TS export assignments. */
  exports(file: string, control?: CodeRequestControl): Promise<TreeSitterResult<ExportRecord[]>>;
  /** Return the smallest syntax node at a 1-based UTF-16 position. */
  nodeAt(
    file: string,
    line: number,
    character: number,
    control?: CodeRequestControl,
  ): Promise<TreeSitterResult<NodeAtResult>>;
  /** Extract structural outgoing calls from the enclosing scope at a position. */
  calleesAt(
    file: string,
    line: number,
    character: number,
    depthOrOptions?:
      | "direct"
      | "deep"
      | { depth?: "direct" | "deep"; control?: CodeRequestControl },
  ): Promise<TreeSitterResult<CalleesAtResult>>;
  /** Extract all call-site identifiers in a file. */
  callSites(file: string, control?: CodeRequestControl): Promise<TreeSitterResult<CallSiteMatch[]>>;
}

/** Owned Tree-sitter session that must release its Worker resources. */
export interface TreeSitterSession extends TreeSitterService {
  /** Terminate and await the Structural Worker owned by this session. */
  dispose(): Promise<void>;
}

/** Session-scoped shared structural service published by the extension runtime. */
export type SessionTreeSitterService = TreeSitterService;

export type SessionTreeSitterServiceState =
  | { kind: "ready"; service: SessionTreeSitterService }
  | { kind: "unavailable"; reason: string };

/** Supported grammar identifiers. */
export type GrammarId =
  | "javascript"
  | "typescript"
  | "tsx"
  | "python"
  | "rust"
  | "go"
  | "c"
  | "cpp"
  | "java"
  | "kotlin"
  | "ruby"
  | "bash"
  | "html"
  | "r"
  | "sql";

/** Supported file extension. */
export type SupportedExtension =
  | ".ts"
  | ".tsx"
  | ".js"
  | ".jsx"
  | ".mts"
  | ".cts"
  | ".mjs"
  | ".cjs"
  | ".py"
  | ".pyi"
  | ".rs"
  | ".go"
  | ".c"
  | ".h"
  | ".cpp"
  | ".hpp"
  | ".cc"
  | ".cxx"
  | ".hxx"
  | ".c++"
  | ".h++"
  | ".java"
  | ".kt"
  | ".kts"
  | ".rb"
  | ".gemspec"
  | ".sh"
  | ".bash"
  | ".zsh"
  | ".ksh"
  | ".html"
  | ".htm"
  | ".xhtml"
  | ".r"
  | ".sql";
