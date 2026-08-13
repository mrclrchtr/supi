import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { LspRuntimeTransition } from "./runtime-controller.ts";

/** Record bounded aggregate telemetry for one runtime transition. */
export function recordLspRuntimeTransition(transition: LspRuntimeTransition): void {
  const readyClients = transition.projectServers.filter(
    (server) => server.status === "running" && server.ready,
  ).length;
  const trackedFiles = transition.projectServers.reduce(
    (count, server) => count + server.openFiles.length,
    0,
  );
  recordDebugEvent({
    source: "lsp",
    level: transition.kind === "crash" ? "warning" : "debug",
    category: "runtime.transition",
    message: `LSP runtime transition: ${transition.kind}`,
    data: {
      generation: transition.generation,
      kind: transition.kind,
      semanticReady: transition.semanticReady,
      readyClients,
      totalClients: transition.projectServers.length,
      trackedFiles,
    },
  });
}
