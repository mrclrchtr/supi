import type { ProjectServerStatusReason } from "@mrclrchtr/supi-lsp/api";

/** Render a concise explanation for a process-crash recovery state. */
export function formatProjectServerStatusReason(
  reason: ProjectServerStatusReason | undefined,
): string | null {
  switch (reason) {
    case "process-crashed":
      return "process crashed; next file operation will recover";
    case "process-crash-recovery-pending":
      return "process recovery in progress";
    case "process-crash-recovery-exhausted":
      return "process recovery exhausted; reload required";
    default:
      return null;
  }
}
