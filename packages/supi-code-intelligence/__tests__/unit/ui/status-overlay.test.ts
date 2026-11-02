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
  const snapshot = observation([file], current);
  if (snapshot.kind === "not-requested") throw new Error("Expected diagnostic evidence");
  return { evidence: snapshot.evidence, entries: [{ file, diagnostics: [diagnostic(message)] }] };
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
  vi.useRealTimers();
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

  it("respects a configured c action and keeps F5 available for checking", async () => {
    const onCheck = vi.fn(async () => data());
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "c" });
    const { dialog, render, deps } = setup(
      data({ servers: Array.from({ length: 8 }, () => server) }),
      { keybindings, onCheck },
    );
    deps.tui.terminal.rows = 24;
    expect(render()).toContain("F5 check");
    dialog.handleInput("c");
    expect(render()).not.toContain("Capabilities");
    expect(onCheck).not.toHaveBeenCalled();
    dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(onCheck).toHaveBeenCalledOnce());
  });

  it.each([
    {
      bindings: { "tui.select.down": "h" as const },
      hint: "F6 Refresh health",
      input: "\x1b[17~",
      calls: 1,
    },
    {
      bindings: { "tui.select.down": "h" as const, "tui.select.up": "f6" as const },
      hint: "unbound Refresh health",
      input: "\x1b[17~",
      calls: 0,
    },
  ])("respects configured health shortcuts: $hint", async ({ bindings, hint, input, calls }) => {
    const onHealth = vi.fn(async () => data());
    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, bindings);
    const { dialog, render, deps } = setup(
      data({ servers: Array.from({ length: 8 }, () => server) }),
      { keybindings, onHealth },
    );
    deps.tui.terminal.rows = 24;
    expect(render()).toContain(hint);
    dialog.handleInput("h");
    expect(render()).not.toContain("Capabilities");
    expect(onHealth).not.toHaveBeenCalled();
    dialog.handleInput(input);
    expect(onHealth).toHaveBeenCalledTimes(calls);
  });

  it("shares one action guard and keeps navigation, details and the spinner usable during health refresh", async () => {
    vi.useFakeTimers();
    const pending = deferred<CiStatusData>();
    const onHealth = vi.fn(() => pending.promise);
    const onCheck = vi.fn(async () => data());
    const onRefresh = vi.fn(async () => data());
    const { dialog, deps, render } = setup(data(), {
      onHealth,
      onCheck,
      onRefresh,
      fetchDetailedDiagnostics: () => details("src/B.ts", "visible during health refresh"),
    });
    expect(render()).toContain("h Refresh health");
    dialog.handleInput("h");
    const firstFrame = render();
    const renders = vi.mocked(deps.tui.requestRender).mock.calls.length;
    await vi.advanceTimersByTimeAsync(80);
    expect(vi.mocked(deps.tui.requestRender).mock.calls.length).toBeGreaterThan(renders);
    expect(render()).not.toBe(firstFrame);
    expect(render()).toContain("refreshing health");
    dialog.handleInput("r");
    dialog.handleInput("c");
    dialog.handleInput("h");
    expect(onHealth).toHaveBeenCalledOnce();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onCheck).not.toHaveBeenCalled();
    dialog.handleInput("\t");
    dialog.handleInput("\r");
    await vi.advanceTimersByTimeAsync(0);
    expect(render()).toContain("▼ src/B.ts");
    expect(render()).toContain("visible during health refresh");
    pending.resolve(data());
    await vi.advanceTimersByTimeAsync(0);
    expect(render()).not.toContain("refreshing health");
    expect(render()).toContain("▼ src/B.ts");
    const finishedRenders = vi.mocked(deps.tui.requestRender).mock.calls.length;
    await vi.advanceTimersByTimeAsync(160);
    expect(deps.tui.requestRender).toHaveBeenCalledTimes(finishedRenders);

    dialog.handleInput("r");
    dialog.handleInput("h");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onHealth).toHaveBeenCalledOnce();
  });

  it("does not override scrolling or file selection performed while a check is pending", async () => {
    const first = deferred<CiStatusData>();
    const second = deferred<CiStatusData>();
    const snapshot = data({
      servers: Array.from({ length: 8 }, (_, i) => ({ ...server, root: `/project/package-${i}` })),
      diagnosticCheck: {
        kind: "completed",
        files: [{ file: "src/A.ts", status: "confirmed" }],
        total: 2,
        startOffset: 0,
        nextOffset: 1,
        remaining: 1,
      },
    });
    const { dialog, render, deps } = setup(snapshot, {
      onCheck: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      fetchDetailedDiagnostics: vi
        .fn()
        .mockResolvedValueOnce(details("src/B.ts", "before check"))
        .mockResolvedValueOnce(details("src/B.ts", "after check")),
    });
    deps.tui.terminal.rows = 24;
    render();
    dialog.handleInput("c");
    dialog.handleInput("\x1b[F");
    expect(render()).toContain("root: package-7");
    first.resolve(snapshot);
    await vi.waitFor(() => expect(render()).not.toContain("checking"));
    expect(render()).toContain("root: package-7");

    dialog.handleInput("c");
    dialog.handleInput("\t");
    expect(render()).toContain("▶ src/B.ts");
    dialog.handleInput("\r");
    await vi.waitFor(() => expect(render()).toContain("before check"));
    second.resolve(snapshot);
    await vi.waitFor(() => expect(render()).not.toContain("checking"));
    expect(render()).toContain("▼ src/B.ts");
    await vi.waitFor(() => expect(render()).toContain("after check"));
  });

  it("shows tracked unconfirmed filenames without treating empty diagnostics as clean", () => {
    const diagnostics = observation(["src/wait.ts"], false);
    const { render } = setup(data({ diagnostics: { ...diagnostics, entries: [] } }));
    expect(render()).toContain("src/wait.ts  unconfirmed");
    expect(render()).not.toContain("no errors or warnings");
    expect(render()).not.toContain("✓ no issues");
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

  it("shows detail failures and tentative messages without claiming staleness", async () => {
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
    expect(render()).toContain("Details: unconfirmed");
    expect(render()).not.toContain("stale");
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

  it("discloses incomplete nonempty diagnostic evidence beside the file list", () => {
    const { render } = setup(data({ diagnostics: observation(files, false) }));
    expect(render()).toContain("Diagnostic evidence is incomplete");
    expect(render()).not.toContain("stale");
    expect(render()).toContain("0/2 confirmed tracked files");
    expect(render()).toContain("src/A.ts");
    expect(render()).not.toContain("no issues");
  });

  it("keeps confirmed clean evidence file-local when another file is unconfirmed", async () => {
    const snapshot = observation(files, false);
    if (snapshot.kind === "not-requested") throw new Error("Expected evidence");
    const evidence = {
      ...snapshot.evidence,
      confirmed: 1,
      unconfirmed: 1,
      documents: [
        { file: "src/A.ts", status: "confirmed" as const },
        { file: "src/B.ts", status: "unconfirmed" as const },
      ],
    };
    const { dialog, render } = setup(data({ diagnostics: { ...snapshot, evidence } }), {
      fetchDetailedDiagnostics: () => ({
        evidence,
        entries: [{ file: "src/A.ts", diagnostics: [diagnostic("confirmed message")] }],
      }),
    });
    dialog.handleInput("\r");
    await vi.waitFor(() => expect(render()).toContain("confirmed message"));
    expect(render()).toContain("Details: confirmed");
    expect(render()).not.toContain("stale");
    expect(render()).toContain("1/2 confirmed tracked files");
    expect(render()).toContain("1 unconfirmed");
  });

  it("distinguishes no tracked documents from confirmed clean tracked files", () => {
    const empty = observation([]);
    const unknown = setup(data({ diagnostics: empty })).render();
    expect(unknown).toContain("No tracked diagnostic evidence.");
    expect(unknown).not.toContain("no issues");
    const clean = setup(
      data({ diagnostics: { ...observation(["src/clean.ts"]), entries: [] } }),
    ).render();
    expect(clean).toContain("no issues in 1 confirmed tracked file");
    expect(clean).toContain("not a workspace-wide check");
  });

  it.each([
    {
      kind: "unavailable" as const,
      statuses: [],
      summary: "Diagnostics unavailable",
      clean: false,
    },
    {
      kind: "partial" as const,
      statuses: [],
      summary: "No tracked diagnostic evidence.",
      clean: false,
    },
    {
      kind: "completed" as const,
      statuses: ["confirmed" as const],
      summary: "no issues in 1 confirmed tracked file",
      clean: true,
    },
    {
      kind: "partial" as const,
      statuses: ["unconfirmed" as const],
      summary: "Diagnostic evidence is incomplete",
      clean: false,
    },
    {
      kind: "partial" as const,
      statuses: ["failed" as const],
      summary: "Diagnostic evidence is incomplete",
      clean: false,
    },
    {
      kind: "completed" as const,
      statuses: ["removed" as const],
      summary: "Diagnostic evidence is incomplete",
      clean: false,
    },
    {
      kind: "completed" as const,
      statuses: ["confirmed" as const, "removed" as const],
      summary: "Diagnostic evidence is incomplete",
      clean: false,
    },
    {
      kind: "partial" as const,
      statuses: [
        "confirmed" as const,
        "unconfirmed" as const,
        "failed" as const,
        "removed" as const,
      ],
      summary: "Diagnostic evidence is incomplete",
      clean: false,
    },
  ])(
    "bounds summary claims for $kind evidence: $statuses",
    ({ kind, statuses, summary, clean }) => {
      const documents = statuses.map((status, i) => ({ file: `src/file-${i}.ts`, status }));
      const evidence = {
        requested: documents.length,
        confirmed: statuses.filter((status) => status === "confirmed").length,
        unconfirmed: statuses.filter((status) => status === "unconfirmed").length,
        failed: statuses.filter((status) => status === "failed").length,
        removed: statuses.filter((status) => status === "removed").length,
        documents,
      };
      const { render } = setup(
        data({
          diagnostics: {
            kind,
            entries: [],
            scope: { kind: "tracked-files", filter: null },
            evidence,
            reason: "Request evidence is not available for every file.",
          },
        }),
      );
      expect(render()).toContain(summary);
      expect(render().includes("✓ no issues")).toBe(clean);
      expect(render()).not.toContain("stale");
      for (const document of documents) expect(render()).toContain(document.file);
      if (statuses.length === 4) {
        expect(render()).toContain(
          "1/4 confirmed tracked files · 1 unconfirmed · 1 failed · 1 removed",
        );
      }
    },
  );

  it("reports confirmed problems even when every requested file is confirmed", () => {
    const { render } = setup();
    expect(render()).toContain("Errors or warnings reported in 2 confirmed tracked files");
    expect(render()).not.toContain("✓ no issues");
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
    const { dialog, deps } = setup(data({ diagnostics: observation(["src/日本語.ts"]) }), {
      onCheck: async () => data(),
    });
    deps.tui.terminal.rows = 12;
    for (const line of dialog.render(32)) expect(visibleWidth(line)).toBeLessThanOrEqual(32);
    expect(dialog.render(32).length).toBeLessThanOrEqual(10);
    expect(dialog.render(32).join("\n")).toContain("esc close");
    expect(dialog.render(32).join("\n")).toContain("tab/⇧tab files");
    expect(dialog.render(32).join("\n")).toContain("c check");
  });
});
