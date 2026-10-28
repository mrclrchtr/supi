import type { CapabilityState } from "@mrclrchtr/supi-code-runtime/api";
import type { ProjectServerInfo, WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import type { SemanticHealthState } from "../../session/health-types.ts";

/** Derive passive workspace readiness; a runtime owner alone is not a ready server. */
export function deriveWorkspaceSemanticHealthState(
  lspState: WorkspaceLspRuntimeState,
  capabilityState: CapabilityState,
  servers: readonly Pick<ProjectServerInfo, "status" | "ready">[],
): SemanticHealthState {
  if (
    lspState.kind === "ready" &&
    servers.some((server) => server.status === "running" && server.ready)
  ) {
    return { kind: "ready" };
  }
  switch (lspState.kind) {
    case "pending":
      return { kind: "pending", reason: "LSP is starting" };
    case "inactive":
      return { kind: "inactive", reason: "Inactive on the current session branch" };
    case "disabled":
      return { kind: "disabled", reason: "Disabled by configuration" };
    case "unavailable":
      return { kind: "unavailable", reason: lspState.reason };
    case "ready":
      switch (capabilityState.kind) {
        case "inactive":
          return { kind: "inactive", reason: "Inactive on the current session branch" };
        case "disabled":
          return { kind: "disabled", reason: "Disabled by configuration" };
        case "unavailable":
          return { kind: "unavailable", reason: capabilityState.reason };
        default:
          return { kind: "pending", reason: "No active, ready project servers" };
      }
  }
}
