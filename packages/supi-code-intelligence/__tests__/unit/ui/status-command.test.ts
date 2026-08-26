import { completedCodeQuery, getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { getWorkspaceLspRuntime, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCiStatusCommand } from "../../../src/ui/status-command.ts";

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getWorkspaceLspRuntime: vi.fn(),
  };
});

/** Register a minimal semantic provider so getCodeProvider returns "ready" with the mocked LSP. */
function registerMinimalSemantic(cwd: string) {
  getDefaultWorkspaceRuntime().registerSemantic(cwd, {
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
    documentSymbols: async () => completedCodeQuery([]),
    workspaceSymbols: async () => completedCodeQuery([]),
  });
}

function emptyDiagnosticEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  };
}

function readyProjectServer() {
  return {
    name: "typescript",
    root: "/project",
    status: "running",
    ready: true,
    fileTypes: ["ts", "tsx"],
    supportedActions: [],
    openFiles: [],
  };
}

describe("/supi-ci-status command", () => {
  afterEach(() => {
    getDefaultWorkspaceRuntime().clearAll();
    vi.clearAllMocks();
  });

  it("does NOT call ctx.ui.notify (replaced by overlay)", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_graph", "code_health", "lsp_hover", "tree_sitter_outline"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "unavailable",
      reason: "no LSP session",
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("creates overlay with center anchor and 66% width", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "unavailable",
      reason: "no LSP",
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    expect(ctx.ui.custom).toHaveBeenCalled();
    const customMock = ctx.ui.custom as unknown as {
      mock: { calls: Array<[unknown, { overlay?: boolean; overlayOptions?: unknown }]> };
    };
    const [, opts] = customMock.mock.calls[0] ?? [];
    expect(opts?.overlay).toBe(true);
    expect(opts?.overlayOptions).toMatchObject({
      anchor: "center",
      width: "66%",
      minWidth: 60,
    });
  });

  it("sets status bar with readiness and typed route errors", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    registerMinimalSemantic("/project");
    const mockService = {
      getProjectServers: vi.fn(() => [
        readyProjectServer(),
        {
          ...readyProjectServer(),
          root: "/project/packages/app",
          status: "error",
          ready: false,
          statusReason: "process-crash-recovery-exhausted",
        },
      ]),
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        entries: [],
        current: true,
        evidence: emptyDiagnosticEvidence(),
      })),
      getOutstandingDiagnostics: vi.fn(() => ({
        entries: [],
        current: true,
        evidence: emptyDiagnosticEvidence(),
      })),
    } as unknown as WorkspaceLspRuntime;

    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "ready",
      runtime: mockService,
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    const setStatusMock = ctx.ui.setStatus as unknown as {
      mock: { calls: Array<[string, string | undefined]> };
    };
    const call = setStatusMock.mock.calls.find(([key]) => key === "code-intelligence");
    expect(call).toBeDefined();
    expect(call?.[1]).toBeDefined();
    expect(call?.[1]).toContain("1 server");
    expect(call?.[1]).toContain("1 route error");
  });

  it("passes invalidated diagnostic freshness to the status dialog", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);
    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    registerMinimalSemantic("/project");
    const mockService = {
      getProjectServers: vi.fn(() => [readyProjectServer()]),
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        entries: [],
        current: false,
        evidence: emptyDiagnosticEvidence(),
      })),
      getOutstandingDiagnostics: vi.fn(() => ({
        entries: [],
        current: false,
        evidence: emptyDiagnosticEvidence(),
      })),
    } as unknown as WorkspaceLspRuntime;
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({ kind: "ready", runtime: mockService });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;
    await cmd("", ctx);

    const customMock = ctx.ui.custom as unknown as {
      mock: { calls: Array<[(t: unknown, theme: unknown, kb: unknown, done: unknown) => unknown]> };
    };
    const dialog = customMock.mock.calls[0]?.[0]?.(
      { requestRender: vi.fn() },
      ctx.ui.theme,
      undefined,
      vi.fn(),
    ) as { render(width: number): string[] };
    expect(dialog.render(100).join("\n")).toContain("diagnostic snapshot is stale");
  });

  it("sets belowEditor widget when diagnostics exist", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    registerMinimalSemantic("/project");
    const mockService = {
      getProjectServers: vi.fn(() => [readyProjectServer()]),
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        current: true,
        entries: [
          { file: "src/index.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
        ],
        evidence: emptyDiagnosticEvidence(),
      })),
      getOutstandingDiagnostics: vi.fn(() => ({
        entries: [],
        current: true,
        evidence: emptyDiagnosticEvidence(),
      })),
    } as unknown as WorkspaceLspRuntime;

    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "ready",
      runtime: mockService,
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    const setWidgetMock = ctx.ui.setWidget as unknown as {
      mock: { calls: Array<[string, unknown, { placement?: string } | undefined]> };
    };
    const call = setWidgetMock.mock.calls.find(([key]) => key === "code-intelligence");
    expect(call).toBeDefined();
    expect(call?.[2]?.placement).toBe("belowEditor");
    expect(call?.[1]).toBeDefined();
  });

  it("filters active tools to only code_* tools in command data", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_graph", "code_health", "lsp_hover", "tree_sitter_outline"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "unavailable",
      reason: "no LSP",
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    // The custom factory is called with (tui, theme, _kb, done) — we can inspect
    // what the dialog receives. Verify the custom call was made; the dialog's
    // rendering of tools is tested separately in code-intelligence-status-overlay.test.ts
    expect(ctx.ui.custom).toHaveBeenCalled();
  });

  it("sets custom footer while overlay is open", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);

    const setFooterMock = vi.fn();
    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: setFooterMock });

    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "unavailable",
      reason: "no LSP",
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    // setFooter was called with a factory function (and later with undefined for cleanup)
    expect(setFooterMock).toHaveBeenCalledTimes(2);
    expect(typeof setFooterMock.mock.calls[0]?.[0]).toBe("function");
    expect(setFooterMock.mock.calls[1]?.[0]).toBeUndefined();
  });

  it("sorts diagnostics: errors first, then warnings", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_orientation"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    registerMinimalSemantic("/project");
    const mockService = {
      getProjectServers: vi.fn(() => [readyProjectServer()]),
      getOutstandingDiagnosticSummary: vi.fn(() => ({
        current: true,
        entries: [
          { file: "src/warn.ts", total: 1, errors: 0, warnings: 1, information: 0, hints: 0 },
          { file: "src/err.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
          { file: "src/mixed.ts", total: 3, errors: 1, warnings: 2, information: 0, hints: 0 },
        ],
        evidence: emptyDiagnosticEvidence(),
      })),
      getOutstandingDiagnostics: vi.fn(() => ({
        entries: [],
        current: true,
        evidence: emptyDiagnosticEvidence(),
      })),
    } as unknown as WorkspaceLspRuntime;

    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
      kind: "ready",
      runtime: mockService,
    });

    const cmd = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: ReturnType<typeof makeCtx>,
    ) => Promise<void>;

    await cmd("", ctx);

    expect(ctx.ui.custom).toHaveBeenCalled();
    const customMock = ctx.ui.custom as unknown as {
      mock: { calls: Array<[(t: unknown, theme: unknown, kb: unknown, done: unknown) => unknown]> };
    };
    const factoryFn = customMock.mock.calls[0]?.[0];
    expect(factoryFn).toBeDefined();

    // Call the factory to see what data the dialog got
    const tui = { requestRender: vi.fn() };
    const done = vi.fn();
    const dialog = factoryFn?.(tui, ctx.ui.theme, undefined, done);
    // Verify dialog exists
    expect(dialog).toBeDefined();

    // The dialog constructor receives sorted diagnostics.
    // src/err.ts (2 errors) should come before src/mixed.ts (1 error)
    // src/warn.ts (0 errors) should come last
    const lines = (dialog as { render: (w: number) => string[] }).render(80).join("\n");
    const errIdx = lines.indexOf("src/err.ts");
    const mixedIdx = lines.indexOf("src/mixed.ts");
    const warnIdx = lines.indexOf("src/warn.ts");
    expect(errIdx).toBeLessThan(mixedIdx);
    expect(mixedIdx).toBeLessThan(warnIdx);
  });
});
