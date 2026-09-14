import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type { CapabilityAdapter } from "../../src/session/capability-adapter.ts";

/** Create the minimal capability adapter used by public LSP tool tests. */
export function createPublicLspCapability(runtime: WorkspaceLspRuntime): CapabilityAdapter {
  return {
    getProviderState: () => ({ kind: "unavailable", reason: "not used" }),
    getProvider: () => null,
    getSemanticProvider: () => null,
    getStructuralProvider: () => null,
    getLspRuntimeState: () => ({ kind: "ready", runtime }),
    getCapabilityStates: () => ({
      semantic: { kind: "ready" },
      structural: { kind: "unavailable", reason: "not used" },
    }),
    ensureSemanticReadiness: async () => ({ kind: "ready" }),
  };
}
