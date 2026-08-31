import type { ProjectServerStatusReason, WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { describe, expect, it } from "vitest";
import { collectServers } from "../../../../src/analysis/health/signals.ts";

const reasons: ProjectServerStatusReason[] = [
  "process-crashed",
  "process-crash-recovery-pending",
  "process-crash-recovery-exhausted",
];

describe("collectServers", () => {
  it("preserves structured process-crash status reasons", () => {
    const runtime = {
      getProjectServers: () =>
        reasons.map((statusReason) => ({
          name: "typescript",
          root: "/project",
          fileTypes: ["ts"],
          status: "error" as const,
          openFiles: [],
          ready: false,
          statusReason,
        })),
    } as unknown as WorkspaceLspRuntime;

    expect(collectServers(runtime, ["servers"]).map((server) => server.statusReason)).toEqual(
      reasons,
    );
  });
});
