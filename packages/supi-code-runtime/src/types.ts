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

/** A 1-based source position used as a symbol anchor. */
export interface SymbolAnchor {
  line: number;
  character: number;
}

/**
 * Where a declaration sits within its file, as reported by a provider.
 *
 * - `top-level`: directly in the file, not inside another declaration.
 * - `member`: directly inside a class, interface, enum, struct, namespace,
 *   module, or object literal (methods, fields, properties, enum members).
 * - `local`: inside the body of a function, method, or constructor.
 * - `unknown`: the provider reported a flat symbol list without hierarchy.
 */
export type DeclarationLevel = "top-level" | "member" | "local" | "unknown";

/**
 * A discovered symbol / declaration.
 *
 * Per ADR 0003, anchors are split so position-strict substrates
 * (structural callee lookup, LSP `rename`) cannot silently consume a
 * declaration anchor (the `export` keyword) as if it were the identifier.
 * - `declarationAnchor` is always present (the defining node start).
 * - `nameAnchor` is best-effort (the identifier token), present when the
 *   provider can derive it (LSP `selectionRange`, or a tree-sitter snap).
 *   Strict consumers must prefer it and hard-fail when it is absent.
 */
export interface CodeSymbol {
  name: string;
  kind: string;
  file: string;
  declarationAnchor: SymbolAnchor;
  nameAnchor?: SymbolAnchor;
  /** Named enclosing declaration when reported; absence does not prove a top-level declaration. */
  container?: string | null;
}

/**
 * A document-scoped declaration with explicit hierarchy evidence.
 *
 * `unknown` means the provider returned a flat observation without an actual
 * hierarchy. A reported container name remains metadata and does not promote
 * a flat observation to a known level.
 */
export interface DocumentCodeSymbol extends CodeSymbol {
  level: DeclarationLevel;
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
  | {
      kind: "partial";
      data: T;
      file: string;
      reason: string;
      /** Syntax error and missing-node ranges in 0-based UTF-16 coordinates. */
      errorRanges: SourceRange[];
    }
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
  /** Common structural search category. */
  kind: string;
  /** Source-language declaration kind, separate from common search category. */
  nativeKind?: string;
  /** Exact 1-based start of the declaration name token, when known. */
  nameAnchor?: SymbolAnchor;
  /** Exclusive 1-based end of a verified literal name span, when known. */
  nameEndAnchor?: SymbolAnchor;
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

/** A document-state precondition established when semantic edits are normalized. */
export type DocumentEditPrecondition =
  | { file: string; kind: "open-document-version"; version: number }
  | {
      file: string;
      kind: "open-document-content";
      version: number;
      fingerprint: string;
    }
  | { file: string; kind: "disk-content" };

/**
 * A precise workspace edit — one or more file edits to apply atomically.
 */
export interface WorkspaceEdit {
  edits: FileEdit[];
  /** Document state that the semantic provider validated before it made this plan. */
  documentPreconditions?: DocumentEditPrecondition[];
}

/**
 * Operation-aware refactor planning request. Each operation carries only the
 * scope it needs:
 *
 * - `rename_symbol`: one symbol position and the new name.
 * - `code_action`: one file range and a CodeActionKind prefix under `refactor`.
 * - `source_action`: one whole file and a CodeActionKind prefix under `source`.
 *
 * `kind` matches the requested kind and its dotted sub-kinds. `title`, when
 * present, selects one action by its exact title.
 */
export type RefactorRequest =
  | {
      operation: "rename_symbol";
      file: string;
      position: CodePosition;
      newName: string;
    }
  | {
      operation: "code_action";
      file: string;
      range: SourceRange;
      kind: string;
      title?: string;
    }
  | {
      operation: "source_action";
      file: string;
      kind: string;
      title?: string;
    };

/** Supported refactor operation names. */
export type RefactorOperation = RefactorRequest["operation"];

/** The code action selected for a precise code- or source-action plan. */
export interface RefactorActionIdentity {
  /** Server-reported CodeActionKind. */
  kind: string;
  /** Server-reported action title. */
  title: string;
  /**
   * How the edits were obtained: `edit` from the action itself (after
   * `codeAction/resolve` when needed), or `captured-command` from the single
   * `workspace/applyEdit` the server pushed while running the action's command.
   * Captured edits were refused, never applied.
   */
  provenance?: "edit" | "captured-command";
}

/**
 * A disambiguation candidate when a refactor target is ambiguous.
 */
export interface DisambiguationCandidate {
  description: string;
  file?: string;
  line?: number;
  character?: number;
  /** Server-reported CodeActionKind, for code-action candidates. */
  kind?: string;
  /** Exact action title to pass back as `title`, for code-action candidates. */
  title?: string;
}

/**
 * Result of a refactor operation.
 *
 * - `precise`: exact edits available for safe direct apply
 * - `ambiguous`: multiple candidates, caller must disambiguate
 * - `unavailable`: refactoring not possible
 */
export type RefactorResult =
  | {
      kind: "precise";
      edits: WorkspaceEdit;
      /** The selected code action, for code- and source-action plans. */
      action?: RefactorActionIdentity;
      /** Provider roots authorized by the semantic route. Consumers canonicalize before storage. */
      authorizedMutationRoots: string[];
    }
  | { kind: "ambiguous"; candidates: DisambiguationCandidate[] }
  | {
      kind: "unavailable";
      reason: string;
      /** Roots authorized by the routed LSP client, when a route returned no edit. */
      authorizedMutationRoots?: string[];
    };

// ── Structural data shapes (value types, range-flattened) ──────────────

/** Callee collection depth. */
export type CalleeDepth = "direct" | "deep";

/**
 * Structural outgoing calls from the enclosing executable scope at a
 * position. Callee names are source-shape facts, not resolved symbol
 * identities.
 *
 * In `direct` depth, nested function/callback scopes are excluded from the
 * outer scope. In `deep` depth, all callees within the enclosing scope are
 * included, including those inside nested scopes.
 */
export interface CalleesData {
  enclosingScope: { name: string; startLine: number; endLine: number };
  /** Distinct call sites with 1-based UTF-16 start coordinates. */
  callees: Array<{
    name: string;
    /** Optional syntax-shortened label for presentation; does not replace `name`. */
    displayName?: string;
    startLine: number;
    startCharacter: number;
  }>;
  depth: CalleeDepth;
}

/** A single call-site match with name and start line. */
export interface CallSite {
  name: string;
  /** 1-based UTF-16 start position of the written callee expression. */
  startLine: number;
  startCharacter: number;
  /** Exclusive 1-based UTF-16 end position of the captured source expression. */
  endLine: number;
  endCharacter: number;
}
