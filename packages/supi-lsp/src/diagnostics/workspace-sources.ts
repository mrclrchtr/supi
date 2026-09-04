import { type Dirent, promises as fs } from "node:fs";
import * as path from "node:path";
import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import { raceRequestControl } from "../session/readiness.ts";
import type { AutomaticLspPathPolicy } from "../workspace-path-policy.ts";

const MAX_SOURCE_INVENTORY_FILES = 50_000;

export type WorkspaceSourceInventoryReason = "file-limit" | "filesystem-error";

/** Complete or safety-limited automatic source inventory. */
export interface WorkspaceSourceInventory {
  readonly status: "complete" | "limited";
  /** The reason is null only when the inventory is complete. */
  readonly reason: WorkspaceSourceInventoryReason | null;
  /** Number of configured-extension files observed before the scan stopped. */
  readonly observedFileCount: number;
  /** Paths are present only as a usable complete inventory. */
  readonly files: readonly string[];
}

/** Inputs for one automatic source inventory. */
export interface WorkspaceSourceScanOptions {
  readonly fileTypes: readonly string[];
  readonly policy: AutomaticLspPathPolicy;
  readonly control?: CodeRequestControl;
}

/**
 * Scan one workspace for automatic source paths.
 *
 * The scan uses the runtime path policy and configured LSP extensions. A
 * limited result is not a source baseline and must not be diffed. Caller
 * interruption is rethrown so a health call does not retain partial state.
 */
export async function scanWorkspaceSources(
  cwd: string,
  options: WorkspaceSourceScanOptions,
): Promise<WorkspaceSourceInventory> {
  const extensionSet = new Set(
    options.fileTypes.map((fileType) => fileType.replace(/^\./, "").toLowerCase()),
  );
  const files: string[] = [];
  let observedFileCount = 0;
  let reason: WorkspaceSourceInventoryReason | null = null;

  const readEntries = async (directory: string): Promise<Dirent[] | null> => {
    try {
      return await raceRequestControl(
        fs.readdir(directory, { withFileTypes: true }) as Promise<Dirent[]>,
        options.control,
      );
    } catch (error) {
      if (isCodeRequestInterruption(error, options.control)) throw error;
      reason = "filesystem-error";
      return null;
    }
  };

  const visitEntry = async (directory: string, entry: Dirent): Promise<void> => {
    const filePath = path.join(directory, entry.name);
    const kind = entry.isDirectory() ? "directory" : "file";
    if (!options.policy.isEligible(filePath, kind)) return;

    if (entry.isDirectory()) {
      await walk(filePath);
      return;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) return;
    if (!extensionSet.has(path.extname(entry.name).slice(1).toLowerCase())) return;

    observedFileCount++;
    if (observedFileCount > MAX_SOURCE_INVENTORY_FILES) {
      reason = "file-limit";
      return;
    }
    files.push(filePath);
  };

  const walk = async (directory: string): Promise<void> => {
    if (reason !== null) return;
    throwIfCodeRequestInterrupted(options.control);
    if (!options.policy.isEligible(directory, "directory")) return;

    const entries = await readEntries(directory);
    if (!entries) return;
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      throwIfCodeRequestInterrupted(options.control);
      await visitEntry(directory, entry);
      if (reason !== null) return;
    }
  };

  await walk(path.resolve(cwd));
  throwIfCodeRequestInterrupted(options.control);

  return {
    status: reason === null ? "complete" : "limited",
    reason,
    observedFileCount,
    files: reason === null ? files.sort((a, b) => a.localeCompare(b)) : [],
  };
}
