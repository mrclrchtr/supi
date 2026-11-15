import {
  type DebugLevel,
  recordDebugEvent,
  truncateDebugIdentity as truncateIdentity,
} from "@mrclrchtr/supi-core/debug";
import type { ProjectServerInfo } from "../config/types.ts";
import { MAX_SERVERS } from "../debug-telemetry.ts";
import type { LspRuntimeTransition } from "./runtime-controller.ts";

/** One bounded server entry in a runtime-transition payload. */
export interface TransitionServerEntry {
  readonly name: string;
  readonly status: ProjectServerInfo["status"];
  readonly ready: boolean;
  readonly statusReason?: NonNullable<ProjectServerInfo["statusReason"]>;
}

/** Bound a project-server snapshot to MAX_SERVERS name/status/ready entries. */
function boundedServerEntries(
  projectServers: readonly ProjectServerInfo[],
): TransitionServerEntry[] {
  return projectServers.slice(0, MAX_SERVERS).map((server) => ({
    name: truncateIdentity(server.name),
    status: server.status,
    ready: server.ready,
    ...(server.statusReason ? { statusReason: server.statusReason } : {}),
  }));
}

/**
 * Crashes warn; rare recovery and retirement snapshots are `info` so they persist
 * by default. Frequent startup, readiness, and tracked-file transitions stay `debug`.
 */
function transitionLevel(kind: LspRuntimeTransition["kind"]): DebugLevel {
  if (kind === "crash") return "warning";
  return kind === "recovery" || kind === "retirement" ? "info" : "debug";
}

/** Record bounded aggregate telemetry for one runtime transition. */
export function recordLspRuntimeTransition(cwd: string, transition: LspRuntimeTransition): void {
  const readyClients = transition.projectServers.filter(
    (server) => server.status === "running" && server.ready,
  ).length;
  const trackedFiles = transition.projectServers.reduce(
    (count, server) => count + server.openFiles.length,
    0,
  );
  recordDebugEvent({
    source: "lsp",
    level: transitionLevel(transition.kind),
    category: "runtime.transition",
    message: `LSP runtime transition: ${transition.kind}`,
    cwd: truncateIdentity(cwd),
    data: {
      generation: transition.generation,
      kind: transition.kind,
      semanticReady: transition.semanticReady,
      readyClients,
      totalClients: transition.projectServers.length,
      trackedFiles,
      servers: boundedServerEntries(transition.projectServers),
    },
  });
}
