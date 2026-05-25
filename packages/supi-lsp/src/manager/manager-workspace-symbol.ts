import * as fs from "node:fs";
import * as path from "node:path";
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

export async function collectWorkspaceSymbols(
  clients: Iterable<LspClient>,
  query: string,
): Promise<{ results: WorkspaceSymbolLike[]; hasSupport: boolean }> {
  const results: WorkspaceSymbolLike[] = [];
  let hasSupport = false;

  for (const client of clients) {
    if (client.status !== "running") continue;
    if (!client.serverCapabilities?.workspaceSymbolProvider) continue;
    hasSupport = true;
    const result = await client.workspaceSymbol(query);
    if (result) results.push(...result);
  }

  return { results, hasSupport };
}

export async function managerWorkspaceSymbol(
  clients: Iterable<LspClient>,
  query: string,
): Promise<WorkspaceSymbolLike[] | null> {
  const { results, hasSupport } = await collectWorkspaceSymbols(clients, query);
  return hasSupport ? results : null;
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
