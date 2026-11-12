import type { ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { describe, expect, it } from "vitest";
import {
  countProjectServerRouteStatuses,
  formatProjectServerOperationSupport,
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

  it("renders contained route roots relatively and external observed roots absolutely", () => {
    expect(formatProjectServerRoot("/workspace", "/workspace")).toBe(".");
    expect(formatProjectServerRoot("/workspace", "/workspace/packages/app")).toBe("packages/app");
    expect(formatProjectServerRoot("/workspace", "packages/app")).toBe("packages/app");
    expect(formatProjectServerRoot("/workspace", "/external/app")).toBe("/external/app");
    expect(formatProjectServerRoot("/workspace", "../external/app")).toBe("/external/app");
    expect(formatProjectServerRoot("/workspace", "/workspace-sibling/app")).toBe(
      "/workspace-sibling/app",
    );
  });

  it("distinguishes server limits from SuPi planning limits and lists advertised kinds", () => {
    expect(
      formatProjectServerOperationSupport({
        code_action: { server: "not-advertised", supi: "supported" },
        source_action: {
          server: "advertised",
          supi: "supported",
          kinds: ["source.organizeImports", "source.fixAll"],
        },
        rename_symbol: { server: "advertised", supi: "limited", reason: "Example limit." },
      }),
    ).toBe(
      "operation support: code_action: server unsupported | source_action: kinds source.organizeImports, source.fixAll | rename_symbol: SuPi limitation: Example limit.",
    );
  });

  it("marks servers that may return kinds they do not list", () => {
    expect(
      formatProjectServerOperationSupport({
        code_action: {
          server: "advertised",
          supi: "supported",
          kinds: ["refactor", "refactor.extract"],
          anyKind: true,
        },
        source_action: { server: "advertised", supi: "supported", anyKind: true },
      }),
    ).toBe(
      "operation support: code_action: kinds refactor, refactor.extract; may return unlisted kinds | source_action: no kinds listed; may return any kind",
    );
  });

  it("groups operations with identical details", () => {
    expect(
      formatProjectServerOperationSupport({
        code_action: { server: "not-advertised", supi: "supported" },
        source_action: { server: "not-advertised", supi: "supported" },
        rename_symbol: { server: "advertised", supi: "supported" },
      }),
    ).toBe("operation support: code_action, source_action: server unsupported");
  });
});
