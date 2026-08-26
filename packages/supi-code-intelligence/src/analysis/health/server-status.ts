import * as path from "node:path";
import type { ProjectServerInfo, ProjectServerStatusReason } from "@mrclrchtr/supi-lsp/api";

/** Workspace-wide counts for non-running LSP routes. */
export interface ProjectServerRouteStatusCounts {
  recovering: number;
  error: number;
  unavailable: number;
}

/** Count typed route states without changing semantic readiness. */
export function countProjectServerRouteStatuses(
  servers: readonly Pick<ProjectServerInfo, "status" | "statusReason">[],
): ProjectServerRouteStatusCounts {
  return {
    recovering: servers.filter((server) => server.statusReason === "process-crash-recovery-pending")
      .length,
    error: servers.filter(
      (server) =>
        server.status === "error" && server.statusReason !== "process-crash-recovery-pending",
    ).length,
    unavailable: servers.filter((server) => server.status === "unavailable").length,
  };
}

/** Render nonzero workspace route counts for an aggregate status surface. */
export function formatProjectServerRouteSummary(
  servers: readonly Pick<ProjectServerInfo, "status" | "statusReason">[],
): string | null {
  return formatProjectServerRouteStatusCounts(countProjectServerRouteStatuses(servers));
}

/** Render one structured workspace route-count value. */
export function formatProjectServerRouteStatusCounts(
  counts: ProjectServerRouteStatusCounts,
): string | null {
  const parts: string[] = [];
  if (counts.recovering > 0) parts.push(`${counts.recovering} recovering`);
  if (counts.error > 0) parts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  if (counts.unavailable > 0) parts.push(`${counts.unavailable} unavailable`);
  return parts.length > 0 ? `workspace routes: ${parts.join(", ")}` : null;
}

/** Render an LSP route root relative to its workspace. */
export function formatProjectServerRoot(cwd: string, root: string): string {
  const relative = path.relative(cwd, root);
  return (relative || ".").replaceAll("\\", "/");
}

/** Render a concise explanation for a process-crash recovery state. */
export function formatProjectServerStatusReason(
  reason: ProjectServerStatusReason | undefined,
): string | null {
  switch (reason) {
    case "process-crashed":
      return "process crashed; next evidence operation will recover";
    case "process-crash-recovery-pending":
      return "process recovery in progress";
    case "process-crash-recovery-exhausted":
      return "process recovery exhausted; reload required";
    default:
      return null;
  }
}
