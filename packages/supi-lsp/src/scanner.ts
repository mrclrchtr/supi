import { dedupeTopmostRoots, walkProject } from "@mrclrchtr/supi-core";
import type { LspManager } from "./manager.ts";
import type { DetectedProjectServer, LspConfig, ProjectServerInfo } from "./types.ts";
import { commandExists } from "./utils.ts";

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
