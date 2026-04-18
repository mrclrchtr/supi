import * as fs from "node:fs";
import * as path from "node:path";
import type { LspManager } from "./manager.ts";
import type { DetectedProjectServer, LspConfig, ProjectServerInfo } from "./types.ts";
import { commandExists } from "./utils.ts";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".pnpm"]);
const DEFAULT_MAX_DEPTH = 3;

export function scanProjectCapabilities(
  config: LspConfig,
  cwd: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): DetectedProjectServer[] {
  const markerMatches = new Map<string, Set<string>>();

  walkProject(cwd, maxDepth, (directory, entryNames) => {
    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!commandExists(server.command)) continue;
      if (!server.rootMarkers.some((marker) => entryNames.has(marker))) continue;

      const matches = markerMatches.get(serverName) ?? new Set<string>();
      matches.add(directory);
      markerMatches.set(serverName, matches);
    }
  });

  return Object.entries(config.servers)
    .flatMap(([serverName, server]) => {
      if (!commandExists(server.command)) return [];
      const roots = dedupeTopmostRoots(Array.from(markerMatches.get(serverName) ?? []));
      return roots.map(
        (root) =>
          ({
            name: serverName,
            root,
            fileTypes: [...server.fileTypes],
          }) satisfies DetectedProjectServer,
      );
    })
    .sort((a, b) => a.root.localeCompare(b.root) || a.name.localeCompare(b.name));
}

export async function startDetectedServers(
  manager: LspManager,
  detected: DetectedProjectServer[],
): Promise<void> {
  await Promise.all(detected.map((entry) => manager.startServerForRoot(entry.name, entry.root)));
}

export function introspectCapabilities(
  manager: LspManager,
  detected: DetectedProjectServer[],
): ProjectServerInfo[] {
  return manager.getKnownProjectServers(detected);
}

export function dedupeTopmostRoots(roots: string[]): string[] {
  const accepted: string[] = [];

  for (const root of [...new Set(roots.map((entry) => path.resolve(entry)))].sort(byPathDepth)) {
    const isChild = accepted.some((parent) => root !== parent && isWithin(parent, root));
    if (!isChild) {
      accepted.push(root);
    }
  }

  return accepted;
}

function walkProject(
  directory: string,
  depth: number,
  onDirectory: (directory: string, entryNames: Set<string>) => void,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  const entryNames = new Set(entries.map((entry) => entry.name));
  onDirectory(directory, entryNames);

  if (depth <= 0) return;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    walkProject(path.join(directory, entry.name), depth - 1, onDirectory);
  }
}

function byPathDepth(a: string, b: string): number {
  const depthDiff = segmentCount(a) - segmentCount(b);
  return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
}

function segmentCount(target: string): number {
  return path.resolve(target).split(path.sep).filter(Boolean).length;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== "..";
}
