import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import { getDiagnosticFileState } from "../client/client-file-state.ts";

/**
 * Session-owned record of tracked files that disappeared from disk.
 *
 * Every path that clears tracked state for a missing file records the file here,
 * including passive snapshot reads and background server-requested refreshes.
 * The record survives until a caller acknowledges that a report showed the
 * removal, so the removal does not depend on when the next refresh runs.
 *
 * Example: `rm src/a.ts`, then the TypeScript server sends
 * `workspace/diagnostic/refresh`. The background refresh clears `src/a.ts`.
 * A later `code_health({ refresh: true })` still reports it as removed.
 *
 * Entries come only from previously tracked files, so the record is bounded by
 * the tracked-file state it replaces.
 */
export class RemovedTrackedFileLedger {
  readonly #files = new Set<string>();

  /** Record one removed tracked file. */
  record(filePath: string): void {
    this.#files.add(path.resolve(filePath));
  }

  /**
   * Return retained removals within `scope`, sorted, without consuming them.
   *
   * Files that exist again are dropped: a recreated file is no longer removed.
   */
  peek(scope: string | null = null): string[] {
    for (const file of this.#files) {
      if (getDiagnosticFileState(file) !== "removed") this.#files.delete(file);
    }
    const root = scope === null ? null : path.resolve(scope);
    return Array.from(this.#files)
      .filter((file) => root === null || isWithinOrEqual(root, file))
      .sort((left, right) => left.localeCompare(right));
  }

  /** Forget removals that a delivered diagnostic report has shown. */
  acknowledge(files: readonly string[]): void {
    for (const file of files) this.#files.delete(path.resolve(file));
  }

  /** Forget every retained removal. */
  clear(): void {
    this.#files.clear();
  }
}
