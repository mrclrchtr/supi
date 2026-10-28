import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { getWorkspaceLspRuntime, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getHandlerOrThrow, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCiStatusCommand } from "../../../src/ui/status-command.ts";
import type { CiStatusDialog } from "../../../src/ui/status-overlay.ts";

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return { ...actual, getWorkspaceLspRuntime: vi.fn() };
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  getDefaultWorkspaceRuntime().clearAll();
  vi.clearAllMocks();
});

const evidence = {
  requested: 1,
  confirmed: 1,
  unconfirmed: 0,
  failed: 0,
  removed: 0,
  documents: [{ file: "src/warn.ts", status: "confirmed" as const }],
};

function readyRuntime() {
  const runtime = {
    getProjectServers: vi.fn(() => [
      {
        name: "typescript",
        root: "/project",
        status: "running",
        ready: true,
        fileTypes: ["ts"],
        openFiles: [],
      },
    ]),
    getWorkspaceDiagnosticSummary: vi.fn(() => ({
      current: true,
      evidence,
      entries: [{ file: "src/warn.ts", errors: 0, warnings: 1 }],
    })),
    getOutstandingDiagnosticSummary: vi.fn((severity: number) => ({
      current: true,
      evidence,
      entries:
        severity >= 2
          ? [{ file: "src/warn.ts", total: 1, errors: 0, warnings: 1, information: 0, hints: 0 }]
          : [],
    })),
    getOutstandingDiagnostics: vi.fn(() => ({ current: true, evidence, entries: [] })),
  };
  vi.mocked(getWorkspaceLspRuntime).mockReturnValue({
    kind: "ready",
    runtime: runtime as unknown as WorkspaceLspRuntime,
  });
  return runtime;
}

async function openStatus(options: { cwd?: string; homeDir?: string } = {}) {
  const pi = createPiMock();
  pi.setActiveTools(["code_graph", "code_health", "read"]);
  const ctx = makeCtx({ cwd: options.cwd ?? "/project", isProjectTrusted: () => true });
  const setFooter = vi.fn();
  Object.assign(ctx.ui, { setFooter });
  let dialog: CiStatusDialog | undefined;
  let close: () => void = () => {};
  vi.mocked(ctx.ui.custom).mockImplementation(
    (...args: unknown[]) =>
      new Promise((resolve) => {
        const factory = args[0] as (...args: unknown[]) => CiStatusDialog;
        close = () => resolve(undefined);
        dialog = factory(
          { terminal: { rows: 200 }, requestRender: vi.fn() },
          ctx.ui.theme,
          undefined,
          close,
        );
      }),
  );
  registerCiStatusCommand(pi as never, options.homeDir);
  const command = pi.getCommandHandler("supi-ci-status") as (
    args: string,
    context: ReturnType<typeof makeCtx>,
  ) => Promise<void>;
  const pending = command("", ctx);
  await vi.waitFor(() => expect(dialog).toBeDefined());
  const opened = dialog as CiStatusDialog;
  cleanups.push(() => {
    opened.dispose();
    close();
  });
  return {
    pi,
    ctx,
    command,
    pending,
    dialog: opened,
    close: () => close(),
    setFooter,
    render: () => opened.render(120).join("\n"),
  };
}

describe("/supi-ci-status command", () => {
  it("includes warnings without mutating the footer, status, or editor widgets", async () => {
    readyRuntime();
    const status = await openStatus();
    expect(status.render()).toContain("src/warn.ts");
    expect(status.render()).toContain("1 warning");
    expect(status.render()).not.toContain("no issues");
    status.close();
    await status.pending;
    expect(status.setFooter).not.toHaveBeenCalled();
    expect(status.ctx.ui.setStatus).not.toHaveBeenCalled();
    expect(status.ctx.ui.setWidget).not.toHaveBeenCalled();
  });

  it("renders only active code tools, not other tools", async () => {
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({ kind: "unavailable", reason: "no LSP" });
    const status = await openStatus();
    expect(status.render()).toContain("code_graph");
    expect(status.render()).toContain("code_health");
    expect(status.render()).not.toMatch(/\bread\b/);
  });

  it("closes and disposes the existing interaction when toggled, then allows reopening", async () => {
    readyRuntime();
    const status = await openStatus();
    await status.command("", status.ctx);
    await status.pending;
    const next = status.command("", status.ctx);
    await vi.waitFor(() => expect(status.ctx.ui.custom).toHaveBeenCalledTimes(2));
    status.close();
    await next;
  });

  it("closes the active inspector on session shutdown", async () => {
    readyRuntime();
    const status = await openStatus();
    await getHandlerOrThrow(status.pi, "session_shutdown")({}, status.ctx);
    await status.pending;
    expect(status.setFooter).not.toHaveBeenCalled();
  });

  it("reports custom UI failure and permits another attempt", async () => {
    readyRuntime();
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    const ctx = makeCtx();
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    vi.mocked(ctx.ui.custom).mockRejectedValue(new Error("cannot open inspector"));
    const command = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: unknown,
    ) => Promise<void>;
    await command("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("cannot open inspector"),
      "error",
    );
    vi.mocked(ctx.ui.custom).mockResolvedValue(undefined);
    await command("", ctx);
    expect(ctx.ui.custom).toHaveBeenCalledTimes(2);
  });

  it("explains that RPC cannot display a terminal inspector", async () => {
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    const ctx = makeCtx({ mode: "rpc", hasUI: true });
    Object.assign(ctx.ui, { setFooter: vi.fn() });
    const command = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: unknown,
    ) => Promise<void>;
    await command("", ctx);
    expect(ctx.ui.custom).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("code_health"), "warning");
  });

  it("cancels an opening inspector instead of creating duplicate overlays on rapid toggles", async () => {
    readyRuntime();
    const pi = createPiMock();
    registerCiStatusCommand(pi as never);
    const ctx = makeCtx();
    const command = pi.getCommandHandler("supi-ci-status") as (
      args: string,
      ctx: unknown,
    ) => Promise<void>;
    const opening = command("", ctx);
    await command("", ctx);
    await opening;
    expect(ctx.ui.custom).not.toHaveBeenCalled();
    await command("", ctx);
    expect(ctx.ui.custom).toHaveBeenCalledOnce();
  });

  it("shows configuration failure inside the inspector", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "status-config-"));
    const homeDir = mkdtempSync(path.join(os.tmpdir(), "status-config-home-"));
    cleanups.push(() => {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    });
    mkdirSync(path.join(cwd, ".pi/supi"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { exclude: ["legacy-generated"] } }),
    );
    vi.mocked(getWorkspaceLspRuntime).mockReturnValue({ kind: "unavailable", reason: "no LSP" });
    const status = await openStatus({ cwd, homeDir });
    expect(status.render()).toContain("Code intelligence configuration failed");
  });
});
