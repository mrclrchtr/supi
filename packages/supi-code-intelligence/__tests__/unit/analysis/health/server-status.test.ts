import type { ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { describe, expect, it } from "vitest";
import {
  countProjectServerRouteStatuses,
  formatProjectServerRoot,
  formatProjectServerRouteSummary,
} from "../../../../src/analysis/health/server-status.ts";

function server(
  status: ProjectServerInfo["status"],
  statusReason?: ProjectServerInfo["statusReason"],
): ProjectServerInfo {
  return {
    name: "typescript",
    root: "/workspace",
    fileTypes: ["ts"],
    status,
    statusReason,
    supportedActions: [],
    openFiles: [],
    ready: status === "running",
  };
}

describe("LSP route status presentation", () => {
  it("keeps recovering, error, and unavailable counts distinct", () => {
    const servers = [
      server("error", "process-crash-recovery-pending"),
      server("error", "process-crashed"),
      server("error"),
      server("unavailable"),
      server("running"),
    ];

    expect(countProjectServerRouteStatuses(servers)).toEqual({
      recovering: 1,
      error: 2,
      unavailable: 1,
    });
    expect(formatProjectServerRouteSummary(servers)).toBe(
      "workspace routes: 1 recovering, 2 errors, 1 unavailable",
    );
  });

  it("renders every route root relative to the workspace", () => {
    expect(formatProjectServerRoot("/workspace", "/workspace")).toBe(".");
    expect(formatProjectServerRoot("/workspace", "/workspace/packages/app")).toBe("packages/app");
    expect(formatProjectServerRoot("/workspace", "/external/app")).toBe("../external/app");
  });
});
