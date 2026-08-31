// LSP protocol types — re-exported from vscode-languageserver-* packages.
// These are the canonical type definitions maintained by Microsoft alongside the LSP spec.

// ── Protocol types from vscode-languageserver-protocol ───────────────
export {
  type ClientCapabilities,
  DidChangeWatchedFilesParams,
  DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  FileChangeType,
  type FileEvent,
  type FullDocumentDiagnosticReport,
  type InitializeParams,
  type InitializeResult,
  PublishDiagnosticsParams,
  type RelatedFullDocumentDiagnosticReport,
  type RelatedUnchangedDocumentDiagnosticReport,
  type ServerCapabilities,
  TextDocumentPositionParams,
  type UnchangedDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
// ── Core data types from vscode-languageserver-types ─────────────────
export {
  AnnotatedTextEdit,
  CodeAction,
  type CodeActionContext,
  Command,
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  Position,
  Range,
  SnippetTextEdit,
  type StringValue,
  SymbolInformation,
  SymbolKind,
  TextDocumentEdit,
  TextDocumentIdentifier,
  TextDocumentItem,
  TextEdit,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "vscode-languageserver-types";

// ── SuPi-specific server config ──────────────────────────────────────
export type {
  DetectedProjectServer,
  LspConfig,
  MissingServer,
  ProjectServerInfo,
  ProjectServerStatusReason,
  ServerConfig,
} from "./server-config.ts";
