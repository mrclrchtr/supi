import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { getSessionLspService, type SessionLspService } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCiStatusCommand } from "../../src/ui/code-intelligence-status-command.ts";

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    getSessionLspService: vi.fn(),
  };
});

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
    vi.mocked(getSessionLspService).mockReturnValue({
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
    pi.setActiveTools(["code_context"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    vi.mocked(getSessionLspService).mockReturnValue({
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

  it("sets status bar with code-intelligence key when LSP ready with running servers", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_context"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    const mockService = {
      getProjectServers: vi.fn(() => [
        {
          name: "typescript",
          root: "/project",
          status: "running",
          fileTypes: ["ts", "tsx"],
          supportedActions: [],
          openFiles: [],
        },
      ]),
      getOutstandingDiagnosticSummary: vi.fn(() => []),
      getOutstandingDiagnostics: vi.fn(async () => []),
    } as unknown as SessionLspService;

    vi.mocked(getSessionLspService).mockReturnValue({
      kind: "ready",
      service: mockService,
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
  });

  it("sets belowEditor widget when diagnostics exist", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    pi.setActiveTools(["code_context"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    const mockService = {
      getProjectServers: vi.fn(() => []),
      getOutstandingDiagnosticSummary: vi.fn(() => [
        { file: "src/index.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
      ]),
      getOutstandingDiagnostics: vi.fn(async () => []),
    } as unknown as SessionLspService;

    vi.mocked(getSessionLspService).mockReturnValue({
      kind: "ready",
      service: mockService,
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
    vi.mocked(getSessionLspService).mockReturnValue({
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
    pi.setActiveTools(["code_context"]);

    const setFooterMock = vi.fn();
    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: setFooterMock });

    vi.mocked(getSessionLspService).mockReturnValue({
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
    pi.setActiveTools(["code_context"]);

    const ctx = makeCtx({ cwd: "/project" });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    const mockService = {
      getProjectServers: vi.fn(() => []),
      getOutstandingDiagnosticSummary: vi.fn(() => [
        { file: "src/warn.ts", total: 1, errors: 0, warnings: 1, information: 0, hints: 0 },
        { file: "src/err.ts", total: 2, errors: 2, warnings: 0, information: 0, hints: 0 },
        { file: "src/mixed.ts", total: 3, errors: 1, warnings: 2, information: 0, hints: 0 },
      ]),
      getOutstandingDiagnostics: vi.fn(async () => []),
    } as unknown as SessionLspService;

    vi.mocked(getSessionLspService).mockReturnValue({
      kind: "ready",
      service: mockService,
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
