// Shared session-scoped Tree-sitter service registry.
// Peer extensions can import `getSessionTreeSitterService` from the package API
// to reuse the active structural runtime without creating duplicate sessions.

import { createSessionStateRegistry } from "@mrclrchtr/supi-core/api";
import type { SessionTreeSitterService, SessionTreeSitterServiceState } from "../types.ts";

const registry = createSessionStateRegistry<SessionTreeSitterServiceState>(
  "supi-tree-sitter/session-registry",
);

/** Publish the shared Tree-sitter service for one session cwd. */
export function setSessionTreeSitterService(cwd: string, service: SessionTreeSitterService): void {
  registry.set(cwd, { kind: "ready", service });
}

/** Acquire the shared Tree-sitter service state for one session cwd. */
export function getSessionTreeSitterService(cwd: string): SessionTreeSitterServiceState {
  return (
    registry.get(cwd) ?? {
      kind: "unavailable",
      reason: "No Tree-sitter session initialized for this workspace",
    }
  );
}

/** Remove the shared Tree-sitter service for one session cwd. */
export function clearSessionTreeSitterService(cwd: string): void {
  registry.clear(cwd);
}
