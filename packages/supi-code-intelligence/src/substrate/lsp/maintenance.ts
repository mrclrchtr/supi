/**
 * Runtime maintenance — sentinel-sync, stale-module resync, prune, and refresh.
 *
 * Extracted from the former diagnostic-injection.ts. These are non-presentational
 * maintenance operations that keep LSP state fresh for explicit code_health and
 * semantic tool queries.
 */

import * as nodePath from "node:path";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import {
  clearTsconfigCache,
  isLikelyStaleDiagnostic,
  syncWorkspaceSentinelSnapshot,
} from "@mrclrchtr/supi-lsp/api";

/**
 * Run sentinel-sync, stale-module resync, prune, and diagnostic refresh
 * as a single maintenance pass. Call before explicit diagnostic queries
 * (code_health with refresh:true) or semantic tool readiness checks.
 */
export async function refreshLspMaintenance(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  sentinelSnapshot: Map<string, number>,
): Promise<Map<string, number>> {
  const { snapshot } = synchronizeSentinels(runtime, cwd, sentinelSnapshot);

  // Stale-module resync: force-reopen files with "Cannot find module" errors
  await resyncStaleModuleFiles(runtime, cwd);

  // Two-pass prune/refresh for diagnostics
  runtime.pruneMissingFiles();
  try {
    await runtime.refreshOpenDiagnostics();
  } catch {
    /* best-effort */
  }
  runtime.pruneMissingFiles();

  return snapshot;
}

export interface FileLspMaintenanceResult {
  snapshot: Map<string, number>;
  matchedStaleFileCount: number;
}

/** Refresh sentinel and stale-module state for one exact file without a workspace resync. */
export async function refreshFileLspMaintenance(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  sentinelSnapshot: Map<string, number>,
  filePath: string,
): Promise<FileLspMaintenanceResult> {
  const { snapshot } = synchronizeSentinels(runtime, cwd, sentinelSnapshot);
  const target = nodePath.resolve(filePath);
  const stale = runtime
    .getOutstandingDiagnostics(1)
    .entries.some(
      (entry) =>
        nodePath.resolve(cwd, entry.file) === target &&
        entry.diagnostics.some((diagnostic) => isLikelyStaleDiagnostic(diagnostic)),
    );

  runtime.pruneMissingFiles();
  if (stale) {
    runtime.closeFile(target);
    await runtime.trackFile(target);
  }
  runtime.pruneMissingFiles();

  return { snapshot, matchedStaleFileCount: stale ? 1 : 0 };
}

function synchronizeSentinels(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  sentinelSnapshot: Map<string, number>,
) {
  const state = syncWorkspaceSentinelSnapshot(cwd, sentinelSnapshot);
  if (state.changes.length > 0) {
    clearTsconfigCache();
    runtime.noteWorkspaceChanges(state.changes);
  }
  return state;
}

/** Re-open files with stale module-resolution errors. */
async function resyncStaleModuleFiles(runtime: WorkspaceLspRuntime, cwd: string): Promise<void> {
  const outstanding = runtime.getOutstandingDiagnostics(1);
  const staleFiles: string[] = [];

  for (const entry of outstanding.entries) {
    if (entry.diagnostics.some((d) => isLikelyStaleDiagnostic(d))) {
      staleFiles.push(entry.file);
    }
  }

  if (staleFiles.length === 0) return;

  for (const file of staleFiles) {
    const filePath = nodePath.resolve(cwd, file);
    runtime.closeFile(filePath);
    await runtime.trackFile(filePath);
  }

  try {
    await runtime.refreshOpenDiagnostics({ quietMs: 300, maxWaitMs: 2000 });
  } catch {
    /* best-effort */
  }
}
