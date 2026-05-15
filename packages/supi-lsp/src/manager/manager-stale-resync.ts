import * as path from "node:path";
import { isLikelyStaleDiagnostic } from "../diagnostics/stale-diagnostics.ts";
import type { LspManager } from "./manager.ts";

/**
 * Force re-open files with module-resolution errors (e.g., "Cannot find module")
 * to trigger fresh analysis by the language server.
 *
 * The TypeScript server caches diagnostics by file content hash. When a new
 * file is created that resolves an existing file's import, the stale diagnostic
 * persists because the importing file's content hasn't changed. Re-opening the
 * file (didClose + didOpen) forces the server to re-resolve all imports.
 *
 * Returns true if any files were re-synced.
 */
export async function forceResyncStaleModuleFiles(
  manager: LspManager,
  cwd: string,
): Promise<boolean> {
  const outstanding = manager.getOutstandingDiagnostics(1);
  const staleFiles: string[] = [];

  for (const entry of outstanding) {
    if (entry.diagnostics.some((d) => isLikelyStaleDiagnostic(d))) {
      staleFiles.push(entry.file);
    }
  }

  if (staleFiles.length === 0) return false;

  for (const file of staleFiles) {
    const filePath = path.resolve(cwd, file);
    // Close the file to clear cached diagnostics and remove from openDocs
    manager.closeFile(filePath);
    // Re-open to force the server to re-resolve imports
    await manager.ensureFileOpen(filePath);
  }

  // Re-sync and wait for fresh diagnostics after the re-opens
  try {
    await manager.refreshOpenDiagnostics({ quietMs: 300, maxWaitMs: 2000 });
  } catch {
    // Best-effort: don't fail the agent turn if refresh has issues
  }

  return true;
}
