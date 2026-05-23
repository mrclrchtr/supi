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

// Alias for backward compatibility — our code uses ClientDiagnosticCapabilities
import type { DiagnosticClientCapabilities } from "vscode-languageserver-protocol";
export type ClientDiagnosticCapabilities = DiagnosticClientCapabilities;

// ── JSON-RPC types (local — replaced by vscode-jsonrpc in transport task) ──
export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ── SuPi-specific server config ──────────────────────────────────────
export type {
  DetectedProjectServer,
  LspConfig,
  MissingServer,
  ProjectServerInfo,
  ServerConfig,
} from "./server-config.ts";
