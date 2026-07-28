// Live server collection for code_health.

import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type { HealthData, HealthSection } from "../../session/health-types.ts";

/** Collect the current language-server inventory when requested. */
export function collectServers(
  service: WorkspaceLspRuntime | null,
  included: readonly HealthSection[],
): HealthData["servers"] {
  if (!included.includes("servers") || !service) return [];

  return service.getProjectServers().map((server) => ({
    name: server.name,
    root: server.root,
    fileTypes: server.fileTypes,
    status: server.status,
    ready: server.ready,
  }));
}
