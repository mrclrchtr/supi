// Recovery and state description helpers for code_health.
// Extracted from orchestrate.ts.

import type { CapabilityState, CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type {
  DiagnosticEvidenceSummary,
  ProcessCrashDiagnosticDemand,
  RecoverDiagnosticsResult,
  WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";

// ── Recovery ──────────────────────────────────────────────────────────

interface RecoverOptions {
  service: WorkspaceLspRuntime;
  progress?: () => void;
  control?: CodeRequestControl;
  /** Evidence from the maintenance refresh, so the recovery pass skips its own refresh. */
  initialEvidence?: DiagnosticEvidenceSummary;
  /** Explicit demand for crashed diagnostic routes before diagnostic recovery. */
  processCrashDemand?: ProcessCrashDiagnosticDemand;
}

/** Run the runtime's best-effort recovery and preserve its established outcome. */
export async function recoverDiagnosticRuntime(
  opts: RecoverOptions,
): Promise<RecoverDiagnosticsResult> {
  opts.progress?.();
  return opts.service.recoverDiagnostics({
    restartIfStillStale: true,
    ...(opts.initialEvidence !== undefined ? { initialEvidence: opts.initialEvidence } : {}),
    ...(opts.processCrashDemand ? { processCrashDemand: opts.processCrashDemand } : {}),
    control: opts.control,
  });
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
