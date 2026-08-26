import type { CodeRequestControl, SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import type { CapabilityAdapter, ReadinessOutcome } from "./capability-adapter.ts";

export type WorkspaceSemanticDemandState =
  | { kind: "ready"; provider: SemanticProvider }
  | Exclude<ReadinessOutcome, { kind: "ready" }>;

/**
 * Wait for normal workspace startup, but let a registered provider proceed
 * when known crashed routes make readiness recoverable only through demand.
 */
export async function resolveWorkspaceSemanticDemand(
  capability: CapabilityAdapter,
  cwd: string,
  control?: CodeRequestControl,
): Promise<WorkspaceSemanticDemandState> {
  let provider = capability.getSemanticProvider(cwd);
  const readiness = await capability.ensureSemanticReadiness(cwd, { kind: "workspace" }, control);
  if (readiness.kind === "timeout") return readiness;
  if (readiness.kind === "unavailable" && !hasProcessCrashRoute(capability, cwd)) {
    return readiness;
  }

  provider ??= capability.getSemanticProvider(cwd);
  return provider
    ? { kind: "ready", provider }
    : { kind: "unavailable", reason: "No semantic workspace-symbol provider is active." };
}

function hasProcessCrashRoute(capability: CapabilityAdapter, cwd: string): boolean {
  const lspState = capability.getLspRuntimeState(cwd);
  return (
    lspState.kind === "ready" &&
    lspState.runtime.getProjectServers().some((server) => server.statusReason !== undefined)
  );
}
