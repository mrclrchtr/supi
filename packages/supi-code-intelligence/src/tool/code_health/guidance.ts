import type { HealthDiagnosticScope, HealthRefreshState } from "../../session/health-types.ts";

export const toolDescription =
  "Report live diagnostics and language-server health. Use refresh:true when you need fresh diagnostic evidence; without it, diagnostics may be a tracked-file snapshot. Diagnostic snapshots do not prove that the whole workspace is clean; server inventory and route-status counts are always workspace-wide.";

export const promptSnippet = "check live diagnostics and language-server health";

export const promptGuidelines: string[] = [];

/** Next action for missing diagnostic evidence: file-level LSP check versus project-wide compiler check. */
export const DIAGNOSTIC_NEXT_ACTION =
  "for a file-level LSP check, call `code_health` with `scope` set to that file and `refresh: true`; for project-wide validation, run the project's own typecheck or build";

/**
 * Exact-file scopes request live diagnostics; only a tracked-file snapshot read without a refresh
 * in this call can lag edits made outside Pi.
 */
export function isPassiveTrackedSnapshot(
  scope: HealthDiagnosticScope,
  refresh: HealthRefreshState,
): boolean {
  return (
    scope.kind === "tracked-files" && refresh.kind !== "completed" && refresh.kind !== "failed"
  );
}

/**
 * A passive tracked-file snapshot reflects the last synchronization. Files whose disk metadata
 * changed since then are already reported as unconfirmed; this note covers what a stat cannot
 * show: effects of those edits on other files and same-size rewrites within one timestamp tick.
 */
export const PASSIVE_SNAPSHOT_NOTE =
  "This tracked-file snapshot reflects the last LSP synchronization; files changed on disk since then are unconfirmed, but effects of outside edits on other files may not be included. Use `refresh: true` for current evidence";
