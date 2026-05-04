import * as fs from "node:fs";
import * as path from "node:path";
import { dedupeTopmostRoots, walkProject } from "@mrclrchtr/supi-core";
import type { LspManager } from "./manager.ts";
import type {
  DetectedProjectServer,
  LspConfig,
  MissingServer,
  ProjectServerInfo,
  ServerConfig,
} from "./types.ts";
import { commandExists } from "./utils.ts";

const DEFAULT_MAX_DEPTH = 3;

export function scanProjectCapabilities(
  config: LspConfig,
  cwd: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): DetectedProjectServer[] {
  const { markerMatches, extensionBasedServers } = collectServerHints(config, cwd, maxDepth);

  return Object.entries(config.servers)
    .flatMap(([serverName, server]) => {
      if (!commandExists(server.command)) return [];
      const allRoots = new Set(markerMatches.get(serverName) ?? []);
      if (extensionBasedServers.has(serverName)) {
        allRoots.add(cwd);
      }
      const roots = dedupeTopmostRoots(Array.from(allRoots));
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

/** Walk the project collecting marker matches and extension-based server hints. */
function collectServerHints(
  config: LspConfig,
  cwd: string,
  maxDepth: number,
): { markerMatches: Map<string, Set<string>>; extensionBasedServers: Set<string> } {
  const ctx: HintContext = { markerMatches: new Map(), extensionBasedServers: new Set() };

  walkProject(cwd, maxDepth, (directory, entryNames) => {
    inspectDirectory(directory, entryNames, config.servers, ctx);
  });

  return { markerMatches: ctx.markerMatches, extensionBasedServers: ctx.extensionBasedServers };
}

interface HintContext {
  markerMatches: Map<string, Set<string>>;
  extensionBasedServers: Set<string>;
}

/** Check one directory for server markers or matching file extensions. */
function inspectDirectory(
  directory: string,
  entryNames: Set<string>,
  servers: Record<string, ServerConfig>,
  ctx: HintContext,
): void {
  for (const [serverName, server] of Object.entries(servers)) {
    if (!commandExists(server.command)) continue;

    if (server.rootMarkers.length === 0) {
      if (hasMatchingFile(directory, entryNames, server.fileTypes)) {
        ctx.extensionBasedServers.add(serverName);
      }
      continue;
    }

    if (!server.rootMarkers.some((marker) => entryNames.has(marker))) continue;

    const matches = ctx.markerMatches.get(serverName) ?? new Set<string>();
    matches.add(directory);
    ctx.markerMatches.set(serverName, matches);
  }
}

/** Check whether a directory contains a file with one of the target extensions. */
function hasMatchingFile(directory: string, entryNames: Set<string>, fileTypes: string[]): boolean {
  for (const name of entryNames) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!fileTypes.includes(ext)) continue;
    try {
      if (!fs.statSync(path.join(directory, name)).isFile()) continue;
    } catch {
      continue;
    }
    return true;
  }
  return false;
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

/**
 * Scan the project for languages whose source files exist but whose LSP server
 * binary is not installed on PATH. Walks the project directory tree collecting
 * file extensions, then checks each configured server.
 */
export function scanMissingServers(
  config: LspConfig,
  cwd: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): MissingServer[] {
  const foundExtensions = new Set<string>();

  walkProject(cwd, maxDepth, (directory, entryNames) => {
    for (const name of entryNames) {
      try {
        if (!fs.statSync(path.join(directory, name)).isFile()) continue;
      } catch {
        continue;
      }
      const ext = path.extname(name).slice(1).toLowerCase();
      if (ext) foundExtensions.add(ext);
    }
  });

  const missing: MissingServer[] = [];

  for (const [name, server] of Object.entries(config.servers)) {
    if (commandExists(server.command)) continue;

    const matching = server.fileTypes.filter((ft) => foundExtensions.has(ft));
    if (matching.length === 0) continue;

    missing.push({ name, command: server.command, foundExtensions: matching });
  }

  return missing;
}
