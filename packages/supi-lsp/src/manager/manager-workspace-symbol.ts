import * as fs from "node:fs";
import * as path from "node:path";
import {
  type CodeQueryResult,
  completedCodeQuery,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { walkProject } from "@mrclrchtr/supi-core/project";
import type { LspClient } from "../client/client.ts";
import type {
  DocumentSymbol,
  Position,
  SymbolInformation,
  WorkspaceSymbol,
} from "../config/types.ts";

type WorkspaceSymbolLike = SymbolInformation | WorkspaceSymbol;

const SKIP_DIRS = new Set(["node_modules", ".git", ".pnpm", "dist", "build", "coverage"]);
const DEFAULT_WARM_FILE_DEPTH = 4;
const DEFAULT_MARKER_SCAN_DEPTH = 6;

export interface WorkspaceSymbolWarmTarget {
  projectRoot: string;
  file: string;
}

export interface WorkspaceSymbolWarmOptions {
  maxFileDepth?: number;
  maxMarkerDepth?: number;
}

export function getWorkspaceSymbolWarmPosition(
  symbols: DocumentSymbol[] | SymbolInformation[] | null,
): Position | null {
  if (!symbols || symbols.length === 0) return null;
  const first = symbols[0];
  if ("selectionRange" in first) {
    return first.selectionRange.start;
  }
  if ("location" in first) {
    return first.location.range.start;
  }
  return null;
}

export interface WorkspaceSymbolCollection {
  results: WorkspaceSymbolLike[];
  hasSupport: boolean;
  completedClientCount: number;
  failures: string[];
}

export async function collectWorkspaceSymbols(
  clients: Iterable<LspClient>,
  query: string,
): Promise<WorkspaceSymbolCollection> {
  const results: WorkspaceSymbolLike[] = [];
  const failures: string[] = [];
  let hasSupport = false;
  let completedClientCount = 0;

  for (const client of clients) {
    if (client.status !== "running") continue;
    if (!client.serverCapabilities?.workspaceSymbolProvider) continue;
    hasSupport = true;
    const result = await client.workspaceSymbol(query);
    if (result.kind === "unavailable") {
      failures.push(result.reason);
      continue;
    }
    completedClientCount++;
    results.push(...(result.data ?? []));
    if (result.kind === "partial") failures.push(result.reason);
  }

  return { results, hasSupport, completedClientCount, failures };
}

/** Project one multi-client collection into the shared typed query contract. */
export function workspaceSymbolCollectionResult(
  collection: WorkspaceSymbolCollection,
): CodeQueryResult<WorkspaceSymbolLike[]> {
  if (!collection.hasSupport) {
    return unavailableCodeQuery("No active LSP client supports workspace-symbol requests.");
  }
  if (collection.completedClientCount === 0) {
    return unavailableCodeQuery(
      collection.failures.join("; ") || "No workspace-symbol request completed.",
    );
  }
  if (collection.failures.length > 0) {
    return partialCodeQuery(collection.results, collection.failures.join("; "));
  }
  return completedCodeQuery(collection.results);
}

export async function managerWorkspaceSymbol(
  clients: Iterable<LspClient>,
  query: string,
): Promise<CodeQueryResult<WorkspaceSymbolLike[]>> {
  return workspaceSymbolCollectionResult(await collectWorkspaceSymbols(clients, query));
}

export function findWorkspaceSymbolWarmTargets(
  root: string,
  rootMarkers: string[],
  fileTypes: string[],
  options: WorkspaceSymbolWarmOptions = {},
): WorkspaceSymbolWarmTarget[] {
  const resolvedRoot = path.resolve(root);
  const allowed = new Set(fileTypes.map((fileType) => fileType.toLowerCase()));
  const maxFileDepth = options.maxFileDepth ?? DEFAULT_WARM_FILE_DEPTH;
  const maxMarkerDepth = options.maxMarkerDepth ?? DEFAULT_MARKER_SCAN_DEPTH;
  if (allowed.size === 0) return [];

  const markerRoots = collectMarkerRoots(resolvedRoot, rootMarkers, maxMarkerDepth);
  const targets = markerRoots
    .map((entry) => {
      const file = findWarmFileRecursive(entry.root, allowed, maxFileDepth);
      return file ? { projectRoot: entry.root, file, priority: entry.priority } : null;
    })
    .filter((entry): entry is { projectRoot: string; file: string; priority: number } =>
      Boolean(entry),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.projectRoot.length - b.projectRoot.length ||
        a.projectRoot.localeCompare(b.projectRoot),
    )
    .map(({ projectRoot, file }) => ({ projectRoot, file }));

  if (targets.length > 0) return targets;

  const fallback = findWarmFileRecursive(resolvedRoot, allowed, maxFileDepth);
  return fallback ? [{ projectRoot: resolvedRoot, file: fallback }] : [];
}

interface MarkerRootEntry {
  root: string;
  priority: number;
}

function collectMarkerRoots(
  root: string,
  rootMarkers: string[],
  maxDepth: number,
): MarkerRootEntry[] {
  if (rootMarkers.length === 0) return [];

  const markerIndex = new Map(rootMarkers.map((marker, index) => [marker, index]));
  const matches = new Map<string, number>();

  walkProject(root, maxDepth, (directory, entryNames) => {
    const matchedPriority = rootMarkers.reduce<number | null>((best, marker) => {
      if (!entryNames.has(marker)) return best;
      const next = markerIndex.get(marker) ?? Number.MAX_SAFE_INTEGER;
      return best === null ? next : Math.min(best, next);
    }, null);

    if (matchedPriority === null) return;
    const resolvedDirectory = path.resolve(directory);
    const existing = matches.get(resolvedDirectory);
    if (existing === undefined || matchedPriority < existing) {
      matches.set(resolvedDirectory, matchedPriority);
    }
  });

  return Array.from(matches.entries()).map(([matchedRoot, priority]) => ({
    root: matchedRoot,
    priority,
  }));
}

function findWarmFileRecursive(
  directory: string,
  allowed: Set<string>,
  depth: number,
): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sortedEntries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!allowed.has(ext)) continue;
    return path.join(directory, entry.name);
  }

  if (depth <= 0) return null;

  for (const entry of sortedEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const nested = findWarmFileRecursive(path.join(directory, entry.name), allowed, depth - 1);
    if (nested) return nested;
  }

  return null;
}
