// SuPi-specific server configuration types — not part of the LSP specification.

import type { ServerOperationSupportMap } from "./operation-support.ts";
// These are our own types for server discovery, configuration, and status tracking.

/** JSON values accepted by a server's advanced settings object. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** A JSON object passed to a language server as advanced settings. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ServerConfig {
  command: string;
  args?: string[];
  fileTypes: string[];
  /** Files that identify the project root. An empty list uses the session root. */
  rootMarkers: string[];
  enabled?: boolean;
  /** Environment values added when the server process starts. */
  env?: Record<string, string>;
  /** Server-owned configuration settings. This object replaces inherited settings as a whole. */
  settings?: JsonObject;
  /** Options sent during initialize; kept separate from `settings`. */
  initializationOptions?: unknown;
  /** Maximum time to wait for a single $/progress cycle, in ms. Default: 10_000. */
  readinessTimeoutMs?: number;
}

/** LSP configuration keyed by language name (e.g. `typescript`, `python`). */
export interface LspConfig {
  servers: Record<string, ServerConfig>;
}

export interface DetectedProjectServer {
  name: string;
  root: string;
  fileTypes: string[];
}

/** Structured reason for a route-level process-crash recovery state. */
export type ProjectServerStatusReason =
  | "process-crashed"
  | "process-crash-recovery-pending"
  | "process-crash-recovery-exhausted";

export interface ProjectServerInfo extends DetectedProjectServer {
  status: "running" | "error" | "unavailable";
  /** Structured lifecycle reason when process-crash recovery is active. */
  statusReason?: ProjectServerStatusReason;
  openFiles: string[];
  /** Whether the LSP server is currently not indexing and ready to serve queries. */
  ready: boolean;
  /** Negotiated operation support, when the route has a capability snapshot. */
  operationSupport?: ServerOperationSupportMap;
}

/** A language whose source files are present but the server binary is missing. */
export interface MissingServer {
  /** Language name (e.g. "python", "rust"). */
  name: string;
  /** Server command that was not found on PATH. */
  command: string;
  /** File extensions found in the project (subset of server.fileTypes). */
  foundExtensions: string[];
}
