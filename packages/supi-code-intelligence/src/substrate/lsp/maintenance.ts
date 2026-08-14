/**
 * Runtime maintenance — sentinel-sync, stale-module resync, prune, and refresh.
 *
 * Extracted from the former diagnostic-injection.ts. These are non-presentational
 * maintenance operations that keep LSP state fresh for explicit code_health and
 * semantic tool queries.
 */

import { statSync } from "node:fs";
import * as nodePath from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import {
  clearTsconfigCache,
  isLikelyStaleDiagnostic,
  raceRequestControl,
  syncWorkspaceSentinelSnapshot,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { mergeDiagnosticEvidence } from "../../diagnostics/evidence.ts";

/**
 * Run sentinel-sync, diagnostic refresh, and stale-module resync as a single
 * maintenance pass. Call before explicit diagnostic queries (code_health with
 * refresh:true) or semantic tool readiness checks.
 */
export async function refreshLspMaintenance(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  sentinelSnapshot: Map<string, number>,
  control?: CodeRequestControl,
): Promise<WorkspaceLspMaintenanceResult> {
  const { snapshot } = synchronizeSentinels(runtime, cwd, sentinelSnapshot);
  let diagnosticEvidence = emptyEvidence();
  let failureReason: string | undefined;

  // Refresh before stale-module inspection. The refresh owns deleted-file
  // classification; later snapshots must not erase its removed evidence.
  try {
    diagnosticEvidence = await runtime.refreshOpenDiagnostics(undefined, control);
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    failureReason = errorMessage(error);
    diagnosticEvidence = readRuntimeEvidence(runtime);
  }

  try {
    const staleResult = await resyncStaleModuleFiles(runtime, cwd, control);
    diagnosticEvidence = mergeDiagnosticEvidence(diagnosticEvidence, staleResult.evidence, cwd);
    if (staleResult.completed) failureReason = undefined;
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    // Keep evidence from the first refresh when stale inspection fails.
  }

  return {
    snapshot,
    diagnosticEvidence,
    ...(failureReason ? { failureReason } : {}),
  };
}

/** Sentinel state and diagnostic evidence retained from one workspace pass. */
export interface WorkspaceLspMaintenanceResult {
  /** The next sentinel snapshot for the session-owned maintenance state. */
  snapshot: Map<string, number>;
  /** Evidence from every diagnostic refresh performed by this pass. */
  diagnosticEvidence: DiagnosticEvidenceSummary;
  /** Failure from the first workspace refresh, when no fresh pass completed. */
  failureReason?: string;
}

/** Sentinel state and stale-file facts from one file-scoped pass. */
export interface FileLspMaintenanceResult {
  /** The next sentinel snapshot for the session-owned maintenance state. */
  snapshot: Map<string, number>;
  /** Number of stale files that matched the requested file. */
  matchedStaleFileCount: number;
}

/** Refresh sentinel and stale-module state for one exact file without a workspace resync. */
export async function refreshFileLspMaintenance(options: {
  runtime: WorkspaceLspRuntime;
  cwd: string;
  sentinelSnapshot: Map<string, number>;
  filePath: string;
  control?: CodeRequestControl;
}): Promise<FileLspMaintenanceResult> {
  const { runtime, cwd, sentinelSnapshot, filePath, control } = options;
  // A cancelled caller stops before any maintenance work starts.
  throwIfCodeRequestInterrupted(control);
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
    // Race the caller's cancellation so a client start during re-open does
    // not outlive the caller; the underlying runtime keeps its own lifecycle.
    await raceRequestControl(runtime.trackFile(target), control);
  }
  runtime.pruneMissingFiles();
  throwIfCodeRequestInterrupted(control);

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
async function resyncStaleModuleFiles(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  control?: CodeRequestControl,
): Promise<{ evidence: DiagnosticEvidenceSummary; completed: boolean }> {
  const outstanding = runtime.getOutstandingDiagnostics(1);
  const staleFiles: string[] = [];

  for (const entry of outstanding.entries) {
    if (entry.diagnostics.some((d) => isLikelyStaleDiagnostic(d))) {
      staleFiles.push(entry.file);
    }
  }

  if (staleFiles.length === 0) return { evidence: emptyEvidence(), completed: false };

  const invalidated: Array<{
    file: string;
    status: "unconfirmed" | "failed" | "removed";
  }> = staleFiles.map((file) => ({
    file: nodePath.relative(cwd, nodePath.resolve(cwd, file)),
    status: "unconfirmed",
  }));
  for (const file of staleFiles) {
    const filePath = nodePath.resolve(cwd, file);
    const relativeFile = nodePath.relative(cwd, filePath);
    runtime.closeFile(filePath);
    try {
      if (!(await runtime.trackFile(filePath))) {
        markUnavailable(invalidated, relativeFile, filePath);
      }
    } catch (error) {
      if (isCodeRequestInterruption(error, control)) throw error;
      markUnavailable(invalidated, relativeFile, filePath);
    }
  }

  try {
    return {
      evidence: mergeDiagnosticEvidence(
        {
          requested: invalidated.length,
          confirmed: 0,
          unconfirmed: invalidated.length,
          failed: 0,
          removed: 0,
          documents: invalidated,
        },
        await runtime.refreshOpenDiagnostics({ quietMs: 300, maxWaitMs: 2000 }, control),
        cwd,
      ),
      completed: true,
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    return {
      evidence: {
        requested: invalidated.length,
        confirmed: 0,
        unconfirmed: invalidated.filter((document) => document.status === "unconfirmed").length,
        failed: invalidated.filter((document) => document.status === "failed").length,
        removed: invalidated.filter((document) => document.status === "removed").length,
        documents: invalidated,
      },
      completed: false,
    };
  }
}

function markUnavailable(
  documents: Array<{ file: string; status: "unconfirmed" | "failed" | "removed" }>,
  file: string,
  filePath: string,
): void {
  const entry = documents.find((document) => document.file === file);
  if (entry) entry.status = diagnosticFailureStatus(filePath);
}

function diagnosticFailureStatus(filePath: string): "failed" | "removed" {
  try {
    statSync(filePath);
    return "failed";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return "removed";
    }
    return "failed";
  }
}

function readRuntimeEvidence(runtime: WorkspaceLspRuntime): DiagnosticEvidenceSummary {
  try {
    return runtime.getWorkspaceDiagnosticSummary().evidence;
  } catch {
    return emptyEvidence();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Diagnostic refresh failed.";
}

function emptyEvidence(): DiagnosticEvidenceSummary {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  };
}
