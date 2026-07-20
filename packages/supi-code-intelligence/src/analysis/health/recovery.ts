// Recovery and state description helpers for code_health.
// Extracted from orchestrate.ts.

import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";

// ── Recovery ──────────────────────────────────────────────────────────

interface RecoverOptions {
  service: WorkspaceLspRuntime | null;
  refresh: boolean | undefined;
  progress?: () => void;
}

export async function maybeRecover(opts: RecoverOptions): Promise<{ recovered: boolean }> {
  const { service, refresh, progress } = opts;
  if (!refresh || !service) return { recovered: false };

  progress?.();
  try {
    await service.recoverDiagnostics({ restartIfStillStale: true });
    return { recovered: true };
  } catch {
    return { recovered: false };
  }
}

// ── State description helpers ─────────────────────────────────────────

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
