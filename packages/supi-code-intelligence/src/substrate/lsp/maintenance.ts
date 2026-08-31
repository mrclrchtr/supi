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
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type { DiagnosticEvidenceSummary } from "@mrclrchtr/supi-lsp/api";
import {
  FileChangeType,
  type FileEvent,
  invalidateTsconfigCacheForConfig,
  invalidateTsconfigCacheForConfigDir,
  isLikelyStaleDiagnostic,
  isProjectConfigFileName,
  raceRequestControl,
  type WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { mergeDiagnosticEvidence } from "../../diagnostics/evidence.ts";

/** Options shared by the workspace and file-scoped maintenance passes. */
export interface LspMaintenanceOptions {
  control?: CodeRequestControl;
  /**
   * Workspace-relative scope prefix for source-file discovery. Discovery only
   * tracks created files inside this prefix; null disables the scope bound.
   */
  scope?: string | null;
  /**
   * Track files created since the last refresh so the following refresh pull
   * includes them. Only the workspace-runtime path sets this; the snapshot is
   * still widened on file-scoped passes so later diffs stay correct.
   */
  trackSources?: boolean;
}

/**
 * Run sentinel-sync, diagnostic refresh, and stale-module resync as a single
 * maintenance pass. Call before explicit diagnostic queries (code_health with
 * refresh:true) or semantic tool readiness checks.
 */
export async function refreshLspMaintenance(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  sentinelSnapshot: Map<string, number>,
  options: LspMaintenanceOptions = {},
): Promise<WorkspaceLspMaintenanceResult> {
  const { snapshot } = await synchronizeSentinels(runtime, sentinelSnapshot, options);
  let diagnosticEvidence = emptyEvidence();
  let failureReason: string | undefined;

  // Refresh before stale-module inspection. The refresh owns deleted-file
  // classification; later snapshots must not erase its removed evidence.
  try {
    diagnosticEvidence = await runtime.refreshOpenDiagnostics(undefined, options.control);
  } catch (error) {
    if (isCodeRequestInterruption(error, options.control)) throw error;
    failureReason = errorMessage(error);
    diagnosticEvidence = readRuntimeEvidence(runtime);
  }

  try {
    const staleResult = await resyncStaleModuleFiles(runtime, cwd, options.control);
    diagnosticEvidence = mergeDiagnosticEvidence(diagnosticEvidence, staleResult.evidence, cwd);
    if (staleResult.completed) failureReason = undefined;
  } catch (error) {
    if (isCodeRequestInterruption(error, options.control)) throw error;
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
  const { snapshot } = await synchronizeSentinels(runtime, sentinelSnapshot);
  const target = nodePath.resolve(filePath);
  const stale = confirmedOutstandingDiagnostics(runtime, cwd).some(
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

/**
 * Sync the widened workspace snapshot, forward sentinel changes, and track
 * source files newly created since the last pass.
 *
 * The snapshot is widened to every regular file on every pass so later diffs
 * see genuine creations. Only sentinel-file events are forwarded as workspace
 * changes (config semantics unchanged); created source files are tracked only
 * on the workspace-runtime path and only once the snapshot was primed by an
 * earlier pass — the first pass establishes the baseline and cannot tell a
 * just-created file from a long-existing one.
 */
async function synchronizeSentinels(
  runtime: WorkspaceLspRuntime,
  sentinelSnapshot: Map<string, number>,
  options: LspMaintenanceOptions = {},
) {
  const primed = sentinelSnapshot.size > 0;
  const state = runtime.syncWorkspaceSentinelSnapshot(sentinelSnapshot, {
    includeSourceFiles: true,
  });

  invalidateChangedProjectConfigs(state.changes);
  if (state.changes.length > 0) runtime.noteWorkspaceChanges(state.changes);

  if (options.trackSources && primed) {
    await trackCreatedSourceFiles(runtime, state.sourceChanges, options.scope);
  }

  return state;
}

/** Invalidate cached tsconfig scope parses only for config files that changed. */
function invalidateChangedProjectConfigs(changes: readonly FileEvent[]): void {
  for (const change of changes) {
    const filePath = uriToFile(change.uri);
    if (!isProjectConfigFileName(nodePath.basename(filePath))) continue;
    // Change-targeted invalidation: only config files affect tsconfig scope
    // decisions. A created config can also turn previously empty lookups into
    // resolved ones below the new config's directory.
    invalidateTsconfigCacheForConfig(filePath);
    if (change.type === FileChangeType.Created) {
      invalidateTsconfigCacheForConfigDir(nodePath.dirname(filePath));
    }
  }
}

/** Track source files newly created since the last pass, within the scope bound. */
async function trackCreatedSourceFiles(
  runtime: WorkspaceLspRuntime,
  sourceChanges: readonly FileEvent[],
  scope: string | null | undefined,
): Promise<void> {
  for (const change of sourceChanges) {
    if (change.type !== FileChangeType.Created) continue;
    const filePath = uriToFile(change.uri);
    if (scope && !isWithinOrEqual(scope, filePath)) continue;
    if (!runtime.isSupportedSourceFile(filePath)) continue;
    // Best-effort: a file no client can serve stays untracked and is
    // simply absent from evidence until a later explicit request.
    await runtime.trackFile(filePath);
  }
}

/** Return only diagnostics whose document evidence is confirmed. */
function confirmedOutstandingDiagnostics(runtime: WorkspaceLspRuntime, cwd: string) {
  const outstanding = runtime.getOutstandingDiagnostics(1);
  const confirmedFiles = new Set(
    outstanding.evidence.documents
      .filter((document) => document.status === "confirmed")
      .map((document) => nodePath.resolve(cwd, document.file)),
  );
  return outstanding.entries.filter((entry) =>
    confirmedFiles.has(nodePath.resolve(cwd, entry.file)),
  );
}

/** Re-open files with confirmed stale module-resolution errors. */
async function resyncStaleModuleFiles(
  runtime: WorkspaceLspRuntime,
  cwd: string,
  control?: CodeRequestControl,
): Promise<{ evidence: DiagnosticEvidenceSummary; completed: boolean }> {
  const staleFiles: string[] = [];

  for (const entry of confirmedOutstandingDiagnostics(runtime, cwd)) {
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
