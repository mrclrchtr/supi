// Bounded identity vocabulary for LSP debug telemetry.
//
// LSP debug events may carry server, workspace, file, method, and root
// identity for local protocol diagnosis. Every emitted identity string is
// bounded to MAX_IDENTITY_STRING UTF-16 code units (truncation marker
// included) and every identity list is bounded to MAX_SERVERS entries.

/** Maximum number of server entries in one bounded LSP debug payload. */
export const MAX_SERVERS = 16;

/** Maximum UTF-16 code-unit length of one emitted identity string in an LSP debug payload. */
export const MAX_IDENTITY_STRING = 512;

/** Marker appended to an identity string truncated to MAX_IDENTITY_STRING. */
export const IDENTITY_TRUNCATION_MARKER = "…";

/**
 * JSON-RPC error code recorded for client-local request timeouts.
 *
 * The JSON-RPC and LSP vocabularies define no timeout code. This constant
 * uses the JSON-RPC implementation-defined error range (-32099..-32000) at a
 * value that vscode-jsonrpc transport codes (-32099, -32098, -32097, -32096,
 * -32002, -32001) and LSP error codes never use.
 */
export const LSP_REQUEST_TIMEOUT_ERROR_CODE = -32_095;

/**
 * Truncate one identity string so the emitted value (marker included) never
 * exceeds MAX_IDENTITY_STRING UTF-16 code units.
 */
export function truncateIdentity(value: string): string {
  if (value.length <= MAX_IDENTITY_STRING) return value;
  return `${value.slice(0, MAX_IDENTITY_STRING - 1)}${IDENTITY_TRUNCATION_MARKER}`;
}

/** Bound an optional workspace root for event-level identity; undefined stays absent. */
export function boundCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined;
  return truncateIdentity(cwd);
}

/** Bound a server-name list to MAX_SERVERS entries, truncating each name. */
export function boundServerNames(names: readonly string[]): string[] {
  return names.slice(0, MAX_SERVERS).map(truncateIdentity);
}
