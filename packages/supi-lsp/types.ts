// LSP protocol types — minimal subset needed for our client.
// Based on the Language Server Protocol specification.

// ── Positions & Ranges ────────────────────────────────────────────────

/** 0-based line and character offset. */
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface LocationLink {
  originSelectionRange?: Range;
  targetUri: string;
  targetRange: Range;
  targetSelectionRange: Range;
}

// ── Text Edits ────────────────────────────────────────────────────────

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface TextDocumentEdit {
  textDocument: { uri: string; version?: number | null };
  edits: TextEdit[];
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: TextDocumentEdit[];
}

// ── Diagnostics ───────────────────────────────────────────────────────

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;
export type DiagnosticSeverity = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: { href: string };
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

// ── Hover ─────────────────────────────────────────────────────────────

export interface MarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

export type MarkedString = string | { language: string; value: string };

export interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[];
  range?: Range;
}

// ── Symbols ───────────────────────────────────────────────────────────

export const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
} as const;
export type SymbolKind = (typeof SymbolKind)[keyof typeof SymbolKind];

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

// ── Code Actions ──────────────────────────────────────────────────────

export interface CodeActionContext {
  diagnostics: Diagnostic[];
  only?: string[];
}

export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: Command;
}

// ── Publish Diagnostics ───────────────────────────────────────────────

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

// ── Initialize ────────────────────────────────────────────────────────

export interface InitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  initializationOptions?: unknown;
}

export interface ClientCapabilities {
  textDocument?: {
    synchronization?: {
      didSave?: boolean;
      dynamicRegistration?: boolean;
    };
    hover?: {
      contentFormat?: string[];
      dynamicRegistration?: boolean;
    };
    definition?: {
      dynamicRegistration?: boolean;
      linkSupport?: boolean;
    };
    references?: {
      dynamicRegistration?: boolean;
    };
    documentSymbol?: {
      dynamicRegistration?: boolean;
      hierarchicalDocumentSymbolSupport?: boolean;
    };
    rename?: {
      dynamicRegistration?: boolean;
      prepareSupport?: boolean;
    };
    codeAction?: {
      dynamicRegistration?: boolean;
      codeActionLiteralSupport?: {
        codeActionKind: { valueSet: string[] };
      };
    };
    publishDiagnostics?: {
      relatedInformation?: boolean;
    };
  };
  workspace?: {
    workspaceFolders?: boolean;
  };
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
}

export interface ServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number };
  hoverProvider?: boolean;
  definitionProvider?: boolean;
  referencesProvider?: boolean;
  documentSymbolProvider?: boolean;
  renameProvider?: boolean | { prepareProvider?: boolean };
  codeActionProvider?: boolean | { codeActionKinds?: string[] };
}

// ── Text Document Items ───────────────────────────────────────────────

export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface VersionedTextDocumentIdentifier {
  uri: string;
  version: number;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

// ── JSON-RPC ──────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ── Server Configuration ──────────────────────────────────────────────

export interface ServerConfig {
  command: string;
  args?: string[];
  fileTypes: string[];
  rootMarkers: string[];
  enabled?: boolean;
  initializationOptions?: unknown;
}

export interface LspConfig {
  servers: Record<string, ServerConfig>;
}
