import { type Dirent, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  completedCodeQuery,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";
import type { LspClient } from "../client/client.ts";
import type {
  DocumentSymbol,
  Position,
  SymbolInformation,
  WorkspaceSymbol,
} from "../config/types.ts";
import {
  type AutomaticLspPathPolicy,
  createDefaultAutomaticLspPathPolicy,
  walkAutomaticLspTree,
} from "../workspace-path-policy.ts";

type WorkspaceSymbolLike = SymbolInformation | WorkspaceSymbol;

const DEFAULT_WARM_FILE_DEPTH = 4;
const DEFAULT_MARKER_SCAN_DEPTH = 6;
/** Candidates per marker root; later candidates help only when earlier ones land outside the project. */
const WARM_FILES_PER_ROOT = 3;
/** Conventional source directories tried before other top-level entries. */
const PREFERRED_SOURCE_DIRECTORIES = ["src", "lib", "app"];

export interface WorkspaceSymbolWarmTarget {
  projectRoot: string;
  file: string;
}

export interface WorkspaceSymbolWarmOptions {
  maxFileDepth?: number;
  maxMarkerDepth?: number;
  /** Runtime-owned automatic path policy. */
  policy?: AutomaticLspPathPolicy;
  /** Absolute request scopes. Search only their intersection with the route root. */
  scopes?: readonly string[];
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
  /** Results removed by the automatic path policy. */
  excludedCount?: number;
  /** Bounded paths removed by the automatic path policy. */
  excludedExamples?: string[];
  /** Known coverage limits: the server may not have loaded every project in scope. */
  coverageGap?: string;
}

/**
 * Mark a collection whose warm-up never reached a configured project.
 * The server answered only from inferred projects of the opened probe files,
 * so an empty or short result does not prove a symbol is absent.
 */
export function workspaceSymbolCoverageGap(
  collection: WorkspaceSymbolCollection,
  inferredProbeCount: number,
): WorkspaceSymbolCollection {
  const noun = `file${inferredProbeCount === 1 ? "" : "s"}`;
  return {
    ...collection,
    coverageGap:
      `Workspace-symbol coverage is limited: ${inferredProbeCount} opened warm-up ${noun} ` +
      "loaded only inferred projects, not a configured project. Open a project source file and retry.",
  };
}

export async function collectWorkspaceSymbols(
  clients: Iterable<LspClient>,
  query: string,
  control?: CodeRequestControl,
): Promise<WorkspaceSymbolCollection> {
  const results: WorkspaceSymbolLike[] = [];
  const failures: string[] = [];
  let hasSupport = false;
  let completedClientCount = 0;

  for (const client of clients) {
    if (client.status !== "running") continue;
    if (!client.serverCapabilities?.workspaceSymbolProvider) continue;
    hasSupport = true;
    const result = await client.workspaceSymbol(query, control);
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

function workspaceSymbolExclusionReason(collection: WorkspaceSymbolCollection): string | null {
  const excludedCount = collection.excludedCount ?? 0;
  if (excludedCount === 0) return null;
  const noun = `workspace-symbol result${excludedCount === 1 ? "" : "s"}`;
  // Paths belong to typed metadata so consumers can distinguish observed aliases from navigation.
  return `Automatic path policy excluded ${excludedCount} ${noun}.`;
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
  const exclusion = workspaceSymbolExclusionReason(collection);
  if (collection.failures.length > 0 || exclusion || collection.coverageGap) {
    const excludedCount = collection.excludedCount ?? 0;
    const exclusionOnly = collection.failures.length === 0 && !collection.coverageGap;
    const metadata =
      excludedCount > 0
        ? {
            automaticPathExclusion: {
              excludedCount,
              examples: [...(collection.excludedExamples ?? [])],
            },
            ...(exclusionOnly ? { exclusionOnly: true } : {}),
          }
        : undefined;
    return partialCodeQuery(
      collection.results,
      [collection.failures.join("; "), collection.coverageGap, exclusion]
        .filter(Boolean)
        .join("; "),
      metadata,
    );
  }
  return completedCodeQuery(collection.results);
}

/**
 * Choose files to open so a workspace-symbol server loads the projects under `root`.
 *
 * Returns up to three candidates per marker root, interleaved so every root's
 * best candidate comes before any root's fallback; nested roots first. Within a
 * root, conventional source directories come first and hidden entries last:
 * root-level dotfiles and tool configs are often outside the configured program
 * (for example `tsconfig.json` `include`), and opening only such a file loads an
 * unrelated project. Callers try candidates in order.
 */
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
  const policy = options.policy ?? createDefaultAutomaticLspPathPolicy(resolvedRoot);
  if (allowed.size === 0) return [];

  if (options.scopes?.length) {
    const targets = options.scopes.flatMap((scope) => {
      const searchRoot = isWithinOrEqual(resolvedRoot, scope)
        ? scope
        : isWithinOrEqual(scope, resolvedRoot)
          ? resolvedRoot
          : null;
      return searchRoot
        ? findWorkspaceSymbolWarmTargets(searchRoot, rootMarkers, fileTypes, {
            ...options,
            policy: explicitScopePolicy(policy, scope),
            scopes: undefined,
          })
        : [];
    });
    return [...new Map(targets.map((target) => [target.file, target])).values()];
  }

  if (statSync(resolvedRoot, { throwIfNoEntry: false })?.isFile()) {
    return allowed.has(path.extname(resolvedRoot).slice(1).toLowerCase()) &&
      policy.isEligible(resolvedRoot, "file")
      ? [{ projectRoot: path.dirname(resolvedRoot), file: resolvedRoot }]
      : [];
  }

  const markerRoots = collectMarkerRoots(resolvedRoot, rootMarkers, maxMarkerDepth, policy);
  const perRoot = markerRoots
    .sort(
      (a, b) =>
        a.priority - b.priority || a.root.length - b.root.length || a.root.localeCompare(b.root),
    )
    .map((entry) =>
      findWarmFiles(entry.root, allowed, maxFileDepth, policy).map((file) => ({
        projectRoot: entry.root,
        file,
      })),
    );
  // Interleave by rank so each root's best candidate precedes any root's fallback.
  const targets = Array.from({ length: WARM_FILES_PER_ROOT }, (_, rank) =>
    perRoot.flatMap((candidates) => candidates[rank] ?? []),
  ).flat();

  if (targets.length > 0) {
    // Keep the first, most specific root for a file a parent root also reaches.
    const seen = new Set<string>();
    return targets.filter((target) => !seen.has(target.file) && Boolean(seen.add(target.file)));
  }

  return findWarmFiles(resolvedRoot, allowed, maxFileDepth, policy).map((file) => ({
    projectRoot: resolvedRoot,
    file,
  }));
}

/**
 * True when a reported file is inside a scope by spelling or physical identity.
 * Servers may report realpaths for files requested through symlinked roots.
 */
export function isWithinAnyScope(file: string, scopes: readonly string[]): boolean {
  if (scopes.some((scope) => isWithinOrEqual(scope, file))) return true;
  try {
    const physicalFile = realpathSync(file);
    return scopes.some((scope) => {
      try {
        return isWithinOrEqual(realpathSync(scope), physicalFile);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Keep an explicitly selected excluded file or directory warmable, matching the
 * rows workspace-symbol filtering allows for that scope. Exclusions nested in an
 * eligible directory scope stay excluded.
 */
function explicitScopePolicy(
  policy: AutomaticLspPathPolicy,
  scope: string,
): AutomaticLspPathPolicy {
  const kind = statSync(scope, { throwIfNoEntry: false });
  if (!kind) return policy;
  const selected = kind.isFile()
    ? (candidate: string) => path.resolve(candidate) === path.resolve(scope)
    : policy.isEligible(scope, "directory")
      ? null
      : (candidate: string) => isWithinOrEqual(scope, candidate);
  if (!selected) return policy;
  return {
    ...policy,
    isEligible: (candidate, candidateKind) =>
      selected(candidate) ? true : policy.isEligible(candidate, candidateKind),
  };
}

interface MarkerRootEntry {
  root: string;
  priority: number;
}

function collectMarkerRoots(
  root: string,
  rootMarkers: string[],
  maxDepth: number,
  policy: AutomaticLspPathPolicy,
): MarkerRootEntry[] {
  if (rootMarkers.length === 0) return [];

  const markerIndex = new Map(rootMarkers.map((marker, index) => [marker, index]));
  const matches = new Map<string, number>();

  walkAutomaticLspTree(policy, root, maxDepth, (directory, entries) => {
    const entryNames = new Set(entries.map((entry) => entry.name));
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

/**
 * Pick at most {@link WARM_FILES_PER_ROOT} files under `root`, one per top-level
 * group: preferred source directories, other directories, root files, then
 * hidden entries.
 */
function findWarmFiles(
  root: string,
  allowed: Set<string>,
  depth: number,
  policy: AutomaticLspPathPolicy,
): string[] {
  let topLevel: readonly Dirent[] = [];
  walkAutomaticLspTree(policy, root, 0, (_directory, entries) => {
    topLevel = entries;
    return true;
  });
  const isAllowedFile = (entry: Dirent) =>
    (entry.isFile() || entry.isSymbolicLink()) &&
    allowed.has(path.extname(entry.name).slice(1).toLowerCase());
  const rank = (entry: Dirent) => {
    const hidden = entry.name.startsWith(".") ? 3 : 0;
    if (!entry.isDirectory()) return hidden + 2;
    return hidden + (PREFERRED_SOURCE_DIRECTORIES.includes(entry.name) ? 0 : 1);
  };
  const ordered = topLevel
    .filter((entry) => entry.isDirectory() || isAllowedFile(entry))
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);

  const files: string[] = [];
  const rootFileRanks = new Set<number>();
  for (const { entry, rank: entryRank } of ordered) {
    if (files.length >= WARM_FILES_PER_ROOT) break;
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory()) {
      // One root file per visibility group is enough evidence for that group.
      if (rootFileRanks.has(entryRank)) continue;
      rootFileRanks.add(entryRank);
      files.push(entryPath);
      continue;
    }
    if (depth <= 0) continue;
    const file = findWarmFileRecursive(entryPath, allowed, depth - 1, policy);
    if (file) files.push(file);
  }
  return files;
}

function findWarmFileRecursive(
  directory: string,
  allowed: Set<string>,
  depth: number,
  policy: AutomaticLspPathPolicy,
): string | null {
  let warmFile: string | null = null;
  walkAutomaticLspTree(policy, directory, depth, (currentDirectory, entries) => {
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!allowed.has(path.extname(entry.name).slice(1).toLowerCase())) continue;
      warmFile = path.join(currentDirectory, entry.name);
      return true;
    }
    return false;
  });
  return warmFile;
}
