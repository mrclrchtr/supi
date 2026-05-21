// Shared session-scoped Tree-sitter service registry.
// Peer extensions can import `getSessionTreeSitterService` from the package API
// to reuse the active structural runtime without creating duplicate sessions.

import * as path from "node:path";
import type { SessionTreeSitterService, SessionTreeSitterServiceState } from "../types.ts";

const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-tree-sitter/session-registry");

function getRegistry(): Map<string, SessionTreeSitterServiceState> {
  const globalScope = globalThis as typeof globalThis & Record<symbol, unknown>;
  const existing = globalScope[REGISTRY_KEY];
  if (existing instanceof Map) return existing as Map<string, SessionTreeSitterServiceState>;

  const registry = new Map<string, SessionTreeSitterServiceState>();
  globalScope[REGISTRY_KEY] = registry;
  return registry;
}

function normalizeCwd(cwd: string): string {
  return path.resolve(cwd);
}

const registry = getRegistry();

/** Publish the shared Tree-sitter service for one session cwd. */
export function setSessionTreeSitterService(cwd: string, service: SessionTreeSitterService): void {
  registry.set(normalizeCwd(cwd), { kind: "ready", service });
}

/** Acquire the shared Tree-sitter service state for one session cwd. */
export function getSessionTreeSitterService(cwd: string): SessionTreeSitterServiceState {
  return (
    registry.get(normalizeCwd(cwd)) ?? {
      kind: "unavailable",
      reason: "No Tree-sitter session initialized for this workspace",
    }
  );
}

/** Remove the shared Tree-sitter service for one session cwd. */
export function clearSessionTreeSitterService(cwd: string): void {
  registry.delete(normalizeCwd(cwd));
}
