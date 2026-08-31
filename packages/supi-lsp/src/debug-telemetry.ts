// Bounded identity vocabulary for LSP debug telemetry.
//
// LSP debug events can include server, workspace, file, method, and root
// identity for local protocol diagnosis. Each identity string and list uses
// the shared bounds.

import { truncateDebugIdentity } from "@mrclrchtr/supi-core/debug";

/** Maximum number of server entries in one bounded LSP debug payload. */
export const MAX_SERVERS = 16;

/**
 * JSON-RPC error code recorded for client-local request timeouts.
 *
 * The JSON-RPC and LSP vocabularies define no timeout code. This constant
 * uses the JSON-RPC implementation-defined error range (-32099..-32000) at a
 * value that vscode-jsonrpc transport codes (-32099, -32098, -32097, -32096,
 * -32002, -32001) and LSP error codes never use.
 */
export const LSP_REQUEST_TIMEOUT_ERROR_CODE = -32_095;

/** Bound an optional workspace root for event-level identity; undefined stays absent. */
export function boundCwd(cwd: string | undefined): string | undefined {
  if (cwd === undefined) return undefined;
  return truncateDebugIdentity(cwd);
}

/** Bound a server-name list to MAX_SERVERS entries, truncating each name. */
export function boundServerNames(names: readonly string[]): string[] {
  return names.slice(0, MAX_SERVERS).map(truncateDebugIdentity);
}
