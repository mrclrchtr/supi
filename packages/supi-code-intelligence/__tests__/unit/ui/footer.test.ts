import { FOOTER_INVALIDATE_EVENT, footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import type { ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { createMarkedTheme, createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLspAdapterState } from "../../../src/substrate/lsp/state.ts";
import { buildLspStatusText, registerLspFooterContribution } from "../../../src/ui/footer.ts";

afterEach(() => {
  footerContributions.clear();
});

function server(overrides: Partial<ProjectServerInfo>): ProjectServerInfo {
  return {
    name: "typescript",
    root: "/project",
    fileTypes: ["ts"],
    status: "running",
    openFiles: [],
    ready: true,
    ...overrides,
  };
}

function stateWith(
  projectServers: ProjectServerInfo[],
  options: { kind?: string; configurationError?: string | null } = {},
) {
  const state = createLspAdapterState();
  const getProjectServers = vi.fn(() => projectServers);
  state.controller = {
    kind: options.kind ?? "ready",
    latestLifecycleTransition: { projectServers },
    getConfigurationError: () => options.configurationError ?? null,
    workspaceRuntime: { getProjectServers },
  } as never;
  return { state, getProjectServers };
}

describe("LSP footer lifecycle adapter", () => {
  it("renders readiness and tracked files from the published snapshot without querying the runtime", () => {
    const { state, getProjectServers } = stateWith([server({ openFiles: ["/project/src/a.ts"] })]);

    expect(buildLspStatusText(state)).toBe("λ 1✓ ◫1");
    expect(getProjectServers).not.toHaveBeenCalled();
  });

  it("counts a ready route that still loads projects as in progress", () => {
    const { state } = stateWith([
      server({ openFiles: ["/project/src/a.ts"], loadingProjects: true }),
      server({ name: "bash", fileTypes: ["sh"] }),
    ]);

    expect(buildLspStatusText(state)).toBe("λ 1✓ 1⟳ ◫1");
  });

  it("shows process-crash recovery state separately from plain errors", () => {
    const { state } = stateWith([
      server({ status: "error", statusReason: "process-crash-recovery-pending", ready: false }),
    ]);

    expect(buildLspStatusText(state)).toBe("λ 1↻");
  });

  it("groups crashed and plain errors while keeping unavailable distinct", () => {
    const { state } = stateWith([
      server({ status: "error", statusReason: "process-crashed", ready: false }),
      server({ name: "bash", status: "error", ready: false }),
      server({ name: "ruby", status: "unavailable", ready: false }),
    ]);

    expect(buildLspStatusText(state)).toBe("λ 2✗ 1⊘");
  });

  it("colors each route state by severity", () => {
    const { state } = stateWith([
      server({ openFiles: ["/project/a.ts", "/project/b.ts"] }),
      server({ name: "bash", status: "error", ready: false }),
    ]);
    const theme = createMarkedTheme();
    const style = (color: Parameters<typeof theme.fg>[0], text: string) => theme.fg(color, text);

    expect(buildLspStatusText(state, { style, glyphMode: "unicode" })).toBe(
      "[dim]λ[/dim] [success]1✓[/success] [error]1✗[/error] [dim]◫2[/dim]",
    );
  });

  it("follows the footer icon mode", () => {
    const { state } = stateWith([
      server({ openFiles: ["/project/a.ts"] }),
      server({ name: "bash", status: "error", ready: false }),
    ]);
    const plain = (_color: string, text: string) => text;

    expect(buildLspStatusText(state, { style: plain, glyphMode: "nerd" })).toBe(
      "λ 1✓ 1✗ \u{F0DCB}1",
    );
    expect(buildLspStatusText(state, { style: plain, glyphMode: "ascii" })).toBe("lsp 1ok 1x f1");
  });

  it("names a configuration error that prevented startup", () => {
    const { state } = stateWith([], {
      kind: "unavailable",
      configurationError: "lsp.exclude was moved",
    });
    expect(buildLspStatusText(state)).toBe("λ ✗ config");
  });

  it("reports other startup failures as unavailable", () => {
    const { state } = stateWith([], { kind: "unavailable" });
    expect(buildLspStatusText(state)).toBe("λ ✗ unavailable");
  });

  it("stays hidden when every server is disabled", () => {
    const { state } = stateWith([], { kind: "disabled" });
    expect(buildLspStatusText(state)).toBeUndefined();
  });

  it("publishes the same text as a Pi status for other footers", async () => {
    const pi = createPiMock();
    const { state } = stateWith([server({ openFiles: ["/project/a.ts"] })]);
    registerLspFooterContribution(pi as never, state);
    const ctx = makeCtx({ mode: "tui" });

    await pi.emit("session_start", {}, ctx);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("lsp-status", "λ 1✓ ◫1");

    await pi.emit("session_shutdown", {}, ctx);
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("lsp-status", undefined);
  });

  it("stops invalidation events when its listener is disposed", () => {
    const pi = createPiMock();
    const state = createLspAdapterState();
    const contribution = registerLspFooterContribution(pi as never, state);

    state.stateChanges.dispatchEvent(new Event("server-status-changed"));
    expect(pi.events.emit).toHaveBeenCalledWith(FOOTER_INVALIDATE_EVENT, {});

    contribution.dispose();
    vi.mocked(pi.events.emit).mockClear();
    state.stateChanges.dispatchEvent(new Event("server-status-changed"));

    expect(pi.events.emit).not.toHaveBeenCalled();
    expect(footerContributions.getByPlacement("stats-end")).toEqual([]);
  });
});
