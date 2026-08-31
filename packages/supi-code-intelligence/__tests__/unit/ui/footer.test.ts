import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLspAdapterState } from "../../../src/substrate/lsp/state.ts";
import { buildLspStatusText, registerLspFooterContribution } from "../../../src/ui/footer.ts";

afterEach(() => {
  footerContributions.clear();
});

describe("LSP footer lifecycle adapter", () => {
  it("renders aggregate server readiness and tracked files", () => {
    const state = createLspAdapterState();
    state.controller = {
      workspaceRuntime: {
        getProjectServers: () => [
          {
            name: "typescript",
            root: "/project",
            fileTypes: ["ts"],
            status: "running",
            openFiles: ["/project/src/a.ts"],
            ready: true,
          },
        ],
      },
    } as never;

    expect(buildLspStatusText(state)).toBe("λ lsp • 1 ✓ • 1 open file");
  });

  it("shows process-crash recovery state separately from plain errors", () => {
    const state = createLspAdapterState();
    state.controller = {
      workspaceRuntime: {
        getProjectServers: () => [
          {
            name: "typescript",
            root: "/project",
            fileTypes: ["ts"],
            status: "error",
            statusReason: "process-crash-recovery-pending",
            openFiles: [],
            ready: false,
          },
        ],
      },
    } as never;

    expect(buildLspStatusText(state)).toBe("λ lsp • 1 ↻");
  });

  it("groups crashed and plain errors while keeping unavailable distinct", () => {
    const state = createLspAdapterState();
    state.controller = {
      workspaceRuntime: {
        getProjectServers: () => [
          {
            name: "typescript",
            root: "/project",
            fileTypes: ["ts"],
            status: "error",
            statusReason: "process-crashed",
            openFiles: [],
            ready: false,
          },
          {
            name: "bash",
            root: "/project",
            fileTypes: ["sh"],
            status: "error",
            openFiles: [],
            ready: false,
          },
          {
            name: "ruby",
            root: "/project",
            fileTypes: ["rb"],
            status: "unavailable",
            openFiles: [],
            ready: false,
          },
        ],
      },
    } as never;

    expect(buildLspStatusText(state)).toBe("λ lsp • 2 ✗ • 1 ⊘");
  });

  it("stops invalidation events when its listener is disposed", () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const contribution = registerLspFooterContribution(pi as never, state);

    state.stateChanges.dispatchEvent(new Event("server-status-changed"));
    expect(pi.events.emit).toHaveBeenCalledWith("supi:lsp:invalidate", {});

    contribution.dispose();
    vi.mocked(pi.events.emit).mockClear();
    state.stateChanges.dispatchEvent(new Event("server-status-changed"));

    expect(pi.events.emit).not.toHaveBeenCalled();
    expect(footerContributions.getByPlacement("stats-end")).toEqual([]);
  });
});
