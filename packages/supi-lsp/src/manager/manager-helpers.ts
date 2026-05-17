import * as path from "node:path";
import * as projectRoots from "@mrclrchtr/supi-core/api";
import { isGlobMatch } from "../pattern-matcher.ts";

/** Unique key for a client identified by server name and root. */
export function clientKey(serverName: string, root: string): string {
  return `${serverName}:${root}`;
}

/** Resolve the project root for a file given its server's root markers. */
export function resolveRootForFile(
  filePath: string,
  serverName: string,
  rootMarkers: string[],
  opts: { knownRoots: Map<string, string[]>; cwd: string },
): string {
  const preferredRoots = opts.knownRoots.get(serverName) ?? [];
  const knownRoot = projectRoots.resolveKnownRoot(filePath, preferredRoots);
  if (knownRoot) return knownRoot;
  const fileDir = path.dirname(path.resolve(filePath));
  return projectRoots.findProjectRoot(fileDir, rootMarkers, opts.cwd);
}

/** Add a root to the set of known roots for a server, deduplicating. */
export function rememberKnownRoot(
  knownRoots: Map<string, string[]>,
  serverName: string,
  root: string,
): void {
  const roots = knownRoots.get(serverName) ?? [];
  knownRoots.set(serverName, projectRoots.mergeKnownRoots(roots, root));
}

/** Check if a file path matches any user-configured exclude pattern. */
export function isExcludedByPattern(file: string, excludePatterns: string[]): boolean {
  return (
    excludePatterns.length > 0 && excludePatterns.some((pattern) => isGlobMatch(file, pattern))
  );
}
