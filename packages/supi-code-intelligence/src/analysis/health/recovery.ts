// Recovery and state description helpers for code_health.
// Extracted from orchestrate.ts.

import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime, WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";

// ── Recovery ──────────────────────────────────────────────────────────

interface RecoverOptions {
  service: WorkspaceLspRuntime | null;
  refresh: boolean | undefined;
  lspState: WorkspaceLspRuntimeState;
  semanticStateKind?: "pending" | "ready" | "inactive" | "disabled" | "unavailable";
  progress?: () => void;
}

export async function maybeRecover(
  opts: RecoverOptions,
): Promise<{ recovered: boolean; lspStatus: string }> {
  const { service, refresh, lspState, semanticStateKind, progress } = opts;
  let recovered = false;
  let lspStatus = semanticStateKind === "pending" ? "warming…" : describeLspState(lspState);

  if (refresh && service) {
    progress?.();
    try {
      await service.recoverDiagnostics({ restartIfStillStale: true });
      recovered = true;
      lspStatus = "ready (recovered)";
    } catch {
      // Recovery failed but we continue
    }
  }

  return { recovered, lspStatus };
}

// ── State description helpers ─────────────────────────────────────────

export function describeLspState(state: WorkspaceLspRuntimeState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive on current session branch";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}

export function describeStructuralState(state: CapabilityState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "pending":
      return "starting…";
    case "inactive":
      return "inactive";
    case "disabled":
      return "disabled by configuration";
    case "unavailable":
      return `unavailable — ${state.reason}`;
    default:
      return "unknown state";
  }
}
