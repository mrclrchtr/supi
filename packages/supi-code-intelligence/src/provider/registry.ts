// Unified CodeProvider registry — session-scoped, keyed by cwd.
// Peer extensions (LSP, tree-sitter) register their CodeProvider implementations
// at session_start. Multiple providers for the same cwd are composed via
// fallback semantics (semantic methods prefer non-null, structural prefer
// non-unsupported-language).

import { createSessionStateRegistry } from "@mrclrchtr/supi-core/session";
import type { CodeProvider } from "./code-provider.ts";

// ── State type ─────────────────────────────────────────────────────────

export type CodeProviderState =
  | { kind: "ready"; provider: CodeProvider }
  | { kind: "pending" }
  | { kind: "unavailable"; reason: string };

// ── Registry ───────────────────────────────────────────────────────────

const registry = createSessionStateRegistry<CodeProviderState>(
  "supi-code-intelligence/provider-registry",
);

/**
 * Publish a CodeProvider for a session cwd.
 *
 * If a provider is already registered for the same cwd, the new provider
 * is composed with the existing one so that both semantic and structural
 * methods are available regardless of registration order:
 *
 * - Semantic methods (`references`, `implementation`, etc.): tries the
 *   new provider first, falls back to the existing one if it returns null.
 * - Structural methods (`calleesAt`, `exports`, etc.): tries the new
 *   provider first, falls back if the result isn't `"success"`.
 */
export function registerCodeProvider(cwd: string, provider: CodeProvider): void {
  const existing = registry.get(cwd);
  if (existing?.kind === "ready") {
    registry.set(cwd, {
      kind: "ready",
      provider: composeProviders(existing.provider, provider),
    });
  } else {
    registry.set(cwd, { kind: "ready", provider });
  }
}

/** Acquire the CodeProvider state for a session cwd. */
export function getCodeProvider(cwd: string): CodeProviderState {
  return (
    registry.get(cwd) ?? {
      kind: "unavailable",
      reason: "No code provider initialized for this workspace",
    }
  );
}

/** Remove the CodeProvider state for a session cwd. */
export function clearCodeProvider(cwd: string): void {
  registry.clear(cwd);
}

// ── Provider composition ───────────────────────────────────────────────

/**
 * Compose two CodeProviders into one, preferring the second for each
 * operation and falling back to the first.
 */
function composeProviders(existing: CodeProvider, next: CodeProvider): CodeProvider {
  return {
    // Semantic methods: try next (e.g. LSP), fall back to existing
    references: async (file, pos) => {
      const result = await next.references(file, pos);
      return result ?? existing.references(file, pos);
    },
    implementation: async (file, pos) => {
      const result = await next.implementation(file, pos);
      return result ?? existing.implementation(file, pos);
    },
    documentSymbols: async (file) => {
      const result = await next.documentSymbols(file);
      return result ?? existing.documentSymbols(file);
    },
    workspaceSymbols: async (query) => {
      const result = await next.workspaceSymbols(query);
      return result ?? existing.workspaceSymbols(query);
    },

    // Structural methods: try next (e.g. tree-sitter), fall back to existing
    calleesAt: async (file, line, char) => {
      const result = await next.calleesAt(file, line, char);
      return result.kind === "success" ? result : existing.calleesAt(file, line, char);
    },
    exports: async (file) => {
      const result = await next.exports(file);
      return result.kind === "success" ? result : existing.exports(file);
    },
    outline: async (file) => {
      const result = await next.outline(file);
      return result.kind === "success" ? result : existing.outline(file);
    },
    imports: async (file) => {
      const result = await next.imports(file);
      return result.kind === "success" ? result : existing.imports(file);
    },
    nodeAt: async (file, line, char) => {
      const result = await next.nodeAt(file, line, char);
      return result.kind === "success" ? result : existing.nodeAt(file, line, char);
    },
  };
}
