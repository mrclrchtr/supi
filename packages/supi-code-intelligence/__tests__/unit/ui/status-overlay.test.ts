import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import type { Diagnostic, ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthDiagnosticObservation } from "../../../src/session/health-types.ts";
import {
  type CiDiagnosticDetails,
  type CiStatusData,
  type CiStatusDialogDeps,
  createCiStatusDialog,
} from "../../../src/ui/status-overlay.ts";

const files = ["src/A.ts", "src/B.ts"];
function observation(names = files, current = true): HealthDiagnosticObservation {
  return {
    kind: current ? "completed" : "partial",
    scope: { kind: "tracked-files", filter: null },
    entries: names.map((file) => ({ file, errors: 1, warnings: 0 })),
    evidence: {
      requested: names.length,
      confirmed: current ? names.length : 0,
      unconfirmed: current ? 0 : names.length,
      failed: 0,
      removed: 0,
      documents: names.map((file) => ({
        file,
        status: current ? ("confirmed" as const) : ("unconfirmed" as const),
      })),
    },
    ...(!current ? { reason: "Unconfirmed documents have no request-based confirmation." } : {}),
  } as HealthDiagnosticObservation;
}
function data(overrides: Partial<CiStatusData> = {}): CiStatusData {
  return {
    workspaceRoot: "/project",
    servers: [],
    serverInventoryAvailable: true,
    capabilities: { semantic: { kind: "ready" }, structural: { kind: "ready" } },
    diagnostics: observation(),
    activeTools: [],
    ...overrides,
  };
}
function diagnostic(message: string): Diagnostic {
  return {
    message,
    severity: 1,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}
function details(file: string, message: string, current = true): CiDiagnosticDetails {
  return { current, entries: [{ file, diagnostics: [diagnostic(message)] }] };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const dialogs: ReturnType<typeof createCiStatusDialog>[] = [];
afterEach(() => {
  for (const dialog of dialogs.splice(0)) dialog.dispose();
});
function setup(snapshot = data(), overrides: Partial<CiStatusDialogDeps> = {}) {
  const deps = {
    theme: makeCtx().ui.theme,
    done: vi.fn(),
    tui: { terminal: { rows: 200 }, requestRender: vi.fn() },
    ...overrides,
  };
  const dialog = createCiStatusDialog(snapshot, deps);
  dialogs.push(dialog);
  return { dialog, deps, render: (width = 100) => dialog.render(width).join("\n") };
}
const server: ProjectServerInfo = {
  name: "typescript",
  root: "/project",
  status: "running",
  ready: true,
  fileTypes: ["ts"],
  openFiles: [],
};

describe("Code intelligence inspector", () => {
  it("scrolls the whole inspector with arrow keys even when there are no problem files", () => {
    const { dialog, deps, render } = setup(
      data({
        diagnostics: observation([]),
        servers: Array.from({ length: 8 }, (_, i) => ({
          ...server,
          root: `/project/package-${i}`,
        })),
      }),
    );
    deps.tui.terminal.rows = 24;
    expect(render()).toContain("Capabilities");
    dialog.handleInput("\x1b[B");
    expect(render()).not.toContain("Capabilities");
    expect(render()).toContain("esc close");
    dialog.handleInput("k");
    expect(render()).toContain("Capabilities");
    dialog.handleInput("j");
    expect(render()).not.toContain("Capabilities");
    for (let i = 0; i < 80; i++) dialog.handleInput("\x1b[B");
    expect(render()).toContain("root: package-7");
    for (let i = 0; i < 80; i++) dialog.handleInput("\x1b[A");
    expect(render()).toContain("Capabilities");
    expect(render()).not.toContain("root: package-7");
  });

  it("continues downward after paging instead of jumping back to the Problems list", () => {
    const { dialog, deps, render } = setup(
      data({
        servers: Array.from({ length: 8 }, (_, i) => ({
          ...server,
          root: `/project/package-${i}`,
        })),
      }),
    );
    deps.tui.terminal.rows = 24;
    render();
    dialog.handleInput("\x1b[6~");
    expect(render()).not.toContain("Capabilities");
    expect(render()).not.toContain("src/A.ts");
    dialog.handleInput("\x1b[B");
    expect(render()).not.toContain("src/A.ts");
    expect(render()).not.toContain("src/B.ts");
    expect(render()).toContain("root: package-");
  });

  it("keeps file 11 selected and expandable inside the viewport", () => {
    const names = Array.from({ length: 12 }, (_, i) => `src/file-${i + 1}.ts`);
    const { dialog, render, deps } = setup(data({ diagnostics: observation(names) }));
    deps.tui.terminal.rows = 24;
    dialog.render(80);
    for (let i = 0; i < 10; i++) dialog.handleInput("\t");
    expect(render(80)).toContain("▶ src/file-11.ts");
    dialog.handleInput("\x1b[Z");
    expect(render(80)).toContain("▶ src/file-10.ts");
    dialog.handleInput("\t");
    dialog.handleInput("\r");
    expect(render(80)).toContain("▼ src/file-11.ts");
    expect(dialog.render(80).length).toBeLessThanOrEqual(20);
    expect(render(80)).toContain("esc close");
  });

  it("bounds the dialog on short terminals, exposes all sections by scrolling, and responds to resize", () => {
    const { dialog, deps, render } = setup(
      data({
        servers: Array.from({ length: 4 }, (_, i) => ({
          ...server,
          root: `/project/package-${i}`,
        })),
        activeTools: ["code_health"],
      }),
    );
    deps.tui.terminal.rows = 24;
    expect(dialog.render(100).length).toBeLessThanOrEqual(20);
    expect(render()).toContain("src/A.ts");
    dialog.handleInput("\x1b[F"); // End: the tail remains reachable.
    expect(render()).toContain("code_health");
    expect(render()).toContain("esc close");
    dialog.handleInput("\x1b[H"); // Home
    expect(render()).toContain("Capabilities");
    dialog.handleInput("\t");
    deps.tui.terminal.rows = 14;
    expect(dialog.render(100).length).toBeLessThanOrEqual(11);
    expect(render()).toContain("▶ src/B.ts");
    expect(render()).toContain("esc close");
  });

  it("does not snap a manually scrolled server view back to Problems on resize or reload", async () => {
    const snapshot = data({
      servers: Array.from({ length: 8 }, (_, i) => ({ ...server, root: `/project/package-${i}` })),
    });
    const { dialog, render, deps } = setup(snapshot, { onRefresh: async () => snapshot });
    deps.tui.terminal.rows = 24;
    render();
    dialog.handleInput("\x1b[F");
    expect(render()).toContain("root: package-7");
    deps.tui.terminal.rows = 20;
    expect(render()).not.toContain("src/A.ts");
    dialog.handleInput("r");
    await vi.waitFor(() => expect(render()).not.toContain("reloading"));
    expect(render()).not.toContain("src/A.ts");
  });

  it("honors injected navigation and cancel bindings", () => {
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.down": "ctrl+n",
      "tui.select.cancel": "ctrl+x",
      "tui.input.tab": "ctrl+t",
    });
    const { dialog, render, deps } = setup(
      data({
        servers: Array.from({ length: 8 }, () => server),
      }),
      { keybindings },
    );
    deps.tui.terminal.rows = 24;
    render();
    dialog.handleInput("\x0e");
    expect(render()).not.toContain("Capabilities");
    dialog.handleInput("\x14");
    expect(render()).toContain("▶ src/B.ts");
    dialog.handleInput("\x18");
    expect(deps.done).toHaveBeenCalledOnce();
  });

  it("gives configured actions priority over k/r/a shortcut aliases", async () => {
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.down": "k",
      "tui.select.confirm": "r",
      "tui.select.up": "a",
    });
    const reload = vi.fn(async () => data());
    const { dialog, render, deps } = setup(
      data({
        servers: Array.from({ length: 8 }, () => server),
      }),
      { keybindings, onRefresh: reload },
    );
    deps.tui.terminal.rows = 24;
    render();
    dialog.handleInput("k");
    expect(render()).not.toContain("Capabilities");
    dialog.handleInput("r");
    expect(render()).toContain("▼ src/A.ts");
    expect(reload).not.toHaveBeenCalled();
    expect(render()).not.toContain("r reload");
    expect(render()).not.toContain("a collapse");
    dialog.handleInput("a");
    expect(render()).toContain("Capabilities");
  });

  it("honors configured Shift+Tab confirmation before previous-file navigation", () => {
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.confirm": "shift+tab",
    });
    const { dialog, render } = setup(data(), { keybindings });
    dialog.handleInput("\x1b[Z");
    expect(render()).toContain("▼ src/A.ts");
  });

  it("consumes configured confirmation even when there is no file to expand", () => {
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.confirm": "r" });
    const reload = vi.fn(async () => data());
    const { dialog } = setup(data({ diagnostics: observation([]) }), {
      keybindings,
      onRefresh: reload,
    });
    dialog.handleInput("r");
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps filenames and counts readable with long absolute workspace paths", () => {
    const workspaceRoot = "/very/long/workspace/prefix/that/exceeds/the/terminal/width";
    const { dialog } = setup(
      data({
        workspaceRoot,
        diagnostics: observation([
          `${workspaceRoot}/src/first.ts`,
          `${workspaceRoot}/src/second.ts`,
        ]),
      }),
    );
    const rendered = dialog.render(32).join("\n");
    expect(rendered).toContain("src/first.ts");
    expect(rendered).toContain("src/second.ts");
    expect(rendered).toContain("1 error");
    expect(rendered).not.toContain("/very/long/workspace");
  });

  it("does not put a late A response under expanded file B", async () => {
    const a = deferred<CiDiagnosticDetails>();
    const b = deferred<CiDiagnosticDetails>();
    const fetch = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { dialog, render } = setup(data(), { fetchDetailedDiagnostics: fetch });
    dialog.handleInput("\r");
    dialog.handleInput("\t");
    dialog.handleInput("\r");
    b.resolve(details("src/B.ts", "B message"));
    await vi.waitFor(() => expect(render()).toContain("B message"));
    a.resolve(details("src/A.ts", "A message"));
    await a.promise;
    expect(render()).toContain("▼ src/B.ts");
    expect(render()).toContain("B message");
    expect(render()).not.toContain("A message");
  });

  it("does not render or restart work after disposal", async () => {
    const pending = deferred<CiDiagnosticDetails>();
    const { dialog, deps } = setup(data(), { fetchDetailedDiagnostics: () => pending.promise });
    dialog.handleInput("\r");
    dialog.dispose();
    const renderCount = vi.mocked(deps.tui.requestRender).mock.calls.length;
    pending.resolve(details("src/A.ts", "late response"));
    await pending.promise;
    expect(deps.tui.requestRender).toHaveBeenCalledTimes(renderCount);
    expect(dialog.handleInput("\r")).toBe(false);
  });

  it("shows detail failures and stale detail data instead of silently reporting an empty result", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("snapshot read failed"))
      .mockResolvedValueOnce(details("src/A.ts", "old message", false));
    const { dialog, render } = setup(data(), { fetchDetailedDiagnostics: fetch });
    dialog.handleInput("\r");
    await vi.waitFor(() => expect(render()).toContain("Details unavailable: snapshot read failed"));
    dialog.handleInput("a");
    dialog.handleInput("\r");
    await vi.waitFor(() => expect(render()).toContain("old message"));
    expect(render()).toContain("Diagnostic details are stale");
  });

  it("matches runtime-relative details to an absolute summary file", async () => {
    const { dialog, render } = setup(data({ diagnostics: observation(["/project/src/A.ts"]) }), {
      fetchDetailedDiagnostics: () => details("src/A.ts", "matching message"),
    });
    dialog.handleInput("\r");
    await vi.waitFor(() => expect(render()).toContain("matching message"));
  });

  it("retains the previous snapshot after reload failure and coalesces repeated reloads", async () => {
    const pending = deferred<CiStatusData>();
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("reload failed"))
      .mockReturnValueOnce(pending.promise);
    const { dialog, render } = setup(data(), { onRefresh: refresh });
    dialog.handleInput("r");
    await vi.waitFor(() => expect(render()).toContain("Reload failed: reload failed"));
    expect(render()).toContain("src/A.ts");
    dialog.handleInput("r");
    dialog.handleInput("r");
    expect(refresh).toHaveBeenCalledTimes(2);
    pending.resolve(data({ diagnostics: observation(["src/new.ts"]) }));
    await vi.waitFor(() => expect(render()).toContain("src/new.ts"));
    expect(render()).not.toContain("Reload failed");
  });

  it("preserves selection by file identity when reload reorders files", async () => {
    const { dialog, render } = setup(data(), {
      onRefresh: async () => data({ diagnostics: observation(["src/B.ts", "src/A.ts"]) }),
    });
    dialog.handleInput("\t");
    dialog.handleInput("r");
    await vi.waitFor(() => expect(render()).toContain("▶ src/B.ts"));
    dialog.handleInput("\r");
    expect(render()).toContain("▼ src/B.ts");
  });

  it("discloses stale nonempty diagnostic evidence beside the file list", () => {
    const { render } = setup(data({ diagnostics: observation(files, false) }));
    expect(render()).toContain("diagnostic snapshot is stale or incomplete");
    expect(render()).toContain("0/2 confirmed tracked files");
    expect(render()).toContain("src/A.ts");
    expect(render()).not.toContain("no issues");
  });

  it("distinguishes no tracked documents from confirmed clean tracked files", () => {
    const empty = observation([]);
    const unknown = setup(data({ diagnostics: empty })).render();
    expect(unknown).toContain("No confirmed tracked files");
    expect(unknown).not.toContain("no issues");
    const clean = setup(
      data({ diagnostics: { ...observation(["src/clean.ts"]), entries: [] } }),
    ).render();
    expect(clean).toContain("no issues in 1 confirmed tracked files");
    expect(clean).toContain("not a workspace-wide check");
  });

  it("preserves disabled capability state and does not infer refactor support from provider presence", () => {
    const { render } = setup(
      data({
        capabilities: {
          semantic: { kind: "disabled", reason: "Disabled by configuration" },
          structural: { kind: "ready" },
        },
        servers: [
          {
            ...server,
            ready: false,
            operationSupport: { rename_symbol: { server: "not-advertised", supi: "supported" } },
          },
        ],
      }),
    );
    expect(render()).toContain("Semantic: disabled");
    expect(render()).toContain("typescript: starting");
    expect(render()).toContain("rename_symbol: server not-advertised; SuPi supported");
    expect(render()).not.toContain("Refactor: available");
  });

  it("keeps recovery reasons, warnings and the entire active tool list reachable", () => {
    const { render } = setup(
      data({
        servers: [
          {
            ...server,
            status: "error",
            ready: false,
            statusReason: "process-crash-recovery-exhausted",
          },
        ],
        capabilityWarnings: {
          hasWarnings: true,
          warnings: [{ type: "missing-server", language: "python", message: "Server missing" }],
        },
        activeTools: ["code_orientation", "code_graph", "code_find", "code_health"],
      }),
    );
    expect(render()).toContain("process recovery exhausted");
    expect(render()).toContain("python: Server missing");
    expect(render()).toContain("code_health");
  });

  it("fits narrow widths using visible columns, including wide paths", () => {
    const { dialog, deps } = setup(data({ diagnostics: observation(["src/日本語.ts"]) }));
    deps.tui.terminal.rows = 12;
    for (const line of dialog.render(32)) expect(visibleWidth(line)).toBeLessThanOrEqual(32);
    expect(dialog.render(32).length).toBeLessThanOrEqual(10);
    expect(dialog.render(32).join("\n")).toContain("esc close");
    expect(dialog.render(32).join("\n")).toContain("tab/⇧tab files");
  });
});
