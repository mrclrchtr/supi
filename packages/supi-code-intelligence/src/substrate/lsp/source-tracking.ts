import { statSync } from "node:fs";
import * as path from "node:path";
import {
  type CodeRequestControl,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/api";
import type {
  BulkTrackFileOutcome,
  WorkspaceLspRuntime,
  WorkspaceSourceInventory,
} from "@mrclrchtr/supi-lsp/api";
import { isMissingFileError, MAX_BULK_TRACK_FILES } from "@mrclrchtr/supi-lsp/api";

/** Typed session state for sentinel maintenance and automatic source tracking. */
export interface LspMaintenanceState {
  readonly sentinelSnapshot: Map<string, number>;
  readonly sourceBaseline: ReadonlySet<string> | null;
  readonly createdSourceQueue: readonly string[];
}

/** Source discovery and tracking facts from one broad diagnostic refresh. */
export interface SourceTrackingReport {
  readonly status: WorkspaceSourceInventory["status"];
  readonly reason: WorkspaceSourceInventory["reason"];
  readonly observedFileCount: number;
  readonly discovered: readonly string[];
  readonly tracked: readonly string[];
  readonly unsupported: readonly string[];
  readonly unavailable: readonly string[];
  readonly deferred: number;
}

/** Create empty source state with an optional lifecycle-seeded sentinel snapshot. */
export function createLspMaintenanceState(
  sentinelSnapshot: Map<string, number> = new Map(),
): LspMaintenanceState {
  return {
    sentinelSnapshot,
    sourceBaseline: null,
    createdSourceQueue: [],
  };
}

/** Replace the sentinel portion of maintenance state without source state. */
export function withSentinelSnapshot(
  state: LspMaintenanceState,
  sentinelSnapshot: Map<string, number>,
): LspMaintenanceState {
  return { ...state, sentinelSnapshot };
}

/** Discover source additions and process a bounded queue for one refresh. */
export async function trackCreatedSources(options: {
  readonly runtime: WorkspaceLspRuntime;
  readonly cwd: string;
  readonly state: LspMaintenanceState;
  readonly scope?: string | null;
  readonly control?: CodeRequestControl;
}): Promise<{ state: LspMaintenanceState; report: SourceTrackingReport }> {
  const inventory = await options.runtime.scanWorkspaceSources(options.control);
  throwIfCodeRequestInterrupted(options.control);
  if (inventory.status === "limited") {
    return {
      state: options.state,
      report: createReport({
        cwd: options.cwd,
        inventory,
        discovered: [],
        tracked: [],
        unsupported: [],
        unavailable: [],
        deferred: options.state.createdSourceQueue,
        control: options.control,
      }),
    };
  }

  const discovered = discoverCreatedPaths(
    options.state.sourceBaseline,
    inventory.files,
    options.control,
  );
  const queue = removeMissingPaths(
    options.state.sourceBaseline === null
      ? []
      : deduplicatePaths([...options.state.createdSourceQueue, ...discovered], options.control),
    options.control,
  );
  const selected = selectScopedPaths(queue, options.cwd, options.scope, options.control).slice(
    0,
    MAX_BULK_TRACK_FILES,
  );
  const batch =
    selected.length === 0
      ? { outcomes: [] as const }
      : await options.runtime.bulkTrackFiles(selected, options.control);
  const nextQueue = retainQueuePaths(queue, selected, batch.outcomes, options.control);
  const nextState: LspMaintenanceState = {
    sentinelSnapshot: options.state.sentinelSnapshot,
    sourceBaseline: new Set(inventory.files),
    createdSourceQueue: nextQueue,
  };

  const tracked = pathsForOutcome(batch.outcomes, "tracked");
  const unsupported = pathsForOutcome(batch.outcomes, "unsupported");
  const unavailable = pathsForOutcome(batch.outcomes, "unavailable");
  return {
    state: nextState,
    report: createReport({
      cwd: options.cwd,
      inventory,
      discovered,
      tracked,
      unsupported,
      unavailable,
      deferred: nextQueue,
      control: options.control,
    }),
  };
}

function discoverCreatedPaths(
  baseline: ReadonlySet<string> | null,
  current: readonly string[],
  control?: CodeRequestControl,
): string[] {
  if (baseline === null) return [];
  const discovered: string[] = [];
  for (const filePath of current) {
    throwIfCodeRequestInterrupted(control);
    if (!baseline.has(filePath)) discovered.push(filePath);
  }
  return discovered;
}

function selectScopedPaths(
  queue: readonly string[],
  cwd: string,
  scope: string | null | undefined,
  control?: CodeRequestControl,
): string[] {
  const resolvedScope = scope === null || scope === undefined ? null : path.resolve(cwd, scope);
  const selected: string[] = [];
  for (const filePath of queue) {
    throwIfCodeRequestInterrupted(control);
    if (resolvedScope === null || isWithinOrEqual(resolvedScope, filePath)) selected.push(filePath);
  }
  return selected;
}

function retainQueuePaths(
  queue: readonly string[],
  selected: readonly string[],
  outcomes: readonly BulkTrackFileOutcome[],
  control?: CodeRequestControl,
): string[] {
  const selectedSet = new Set(selected);
  const outcomeByPath = new Map(outcomes.map((outcome) => [outcome.file, outcome] as const));
  const unstarted: string[] = [];
  const unavailable: string[] = [];

  for (const filePath of queue) {
    throwIfCodeRequestInterrupted(control);
    if (!selectedSet.has(filePath)) {
      unstarted.push(filePath);
      continue;
    }
    const outcome = outcomeByPath.get(filePath);
    if (!outcome) {
      unstarted.push(filePath);
    } else if (outcome.kind === "unavailable") {
      unavailable.push(filePath);
    }
  }
  return [...unstarted, ...unavailable];
}

function pathsForOutcome(
  outcomes: readonly BulkTrackFileOutcome[],
  kind: BulkTrackFileOutcome["kind"],
): string[] {
  return outcomes.filter((outcome) => outcome.kind === kind).map((outcome) => outcome.file);
}

function createReport(options: {
  cwd: string;
  inventory: WorkspaceSourceInventory;
  discovered: readonly string[];
  tracked: readonly string[];
  unsupported: readonly string[];
  unavailable: readonly string[];
  deferred: readonly string[];
  control?: CodeRequestControl;
}): SourceTrackingReport {
  return {
    status: options.inventory.status,
    reason: options.inventory.reason,
    observedFileCount: options.inventory.observedFileCount,
    discovered: displayPaths(options.cwd, options.discovered, options.control),
    tracked: displayPaths(options.cwd, options.tracked, options.control),
    unsupported: displayPaths(options.cwd, options.unsupported, options.control),
    unavailable: displayPaths(options.cwd, options.unavailable, options.control),
    deferred: options.deferred.length,
  };
}

function displayPaths(
  cwd: string,
  filePaths: readonly string[],
  control?: CodeRequestControl,
): string[] {
  const displayed: string[] = [];
  for (const filePath of filePaths) {
    throwIfCodeRequestInterrupted(control);
    const relativePath = path.relative(cwd, filePath);
    displayed.push((relativePath || path.basename(filePath)).replaceAll(path.sep, "/"));
  }
  return displayed;
}

function deduplicatePaths(filePaths: readonly string[], control?: CodeRequestControl): string[] {
  const unique = new Set<string>();
  for (const filePath of filePaths) {
    throwIfCodeRequestInterrupted(control);
    unique.add(filePath);
  }
  return [...unique];
}

function removeMissingPaths(filePaths: readonly string[], control?: CodeRequestControl): string[] {
  const existing: string[] = [];
  for (const filePath of filePaths) {
    throwIfCodeRequestInterrupted(control);
    if (!isMissingFile(filePath)) existing.push(filePath);
  }
  return existing;
}

function isMissingFile(filePath: string): boolean {
  try {
    statSync(filePath);
    return false;
  } catch (error) {
    return isMissingFileError(error);
  }
}
