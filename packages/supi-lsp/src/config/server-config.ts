// SuPi-specific server configuration types — not part of the LSP specification.
// These are our own types for server discovery, configuration, and status tracking.

export interface ServerConfig {
  command: string;
  args?: string[];
  fileTypes: string[];
  rootMarkers: string[];
  enabled?: boolean;
  initializationOptions?: unknown;
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

export interface ProjectServerInfo extends DetectedProjectServer {
  status: "running" | "error" | "unavailable";
  supportedActions: string[];
  openFiles: string[];
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
