import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setImmediate as flushInputFrame } from "node:timers/promises";
import {
  type CodeQueryResult,
  type CodeRequestControl,
  getDefaultWorkspaceRuntime,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import {
  type BulkTrackFilesResult,
  type Diagnostic,
  getWorkspaceLspRuntime,
  type WorkspaceLspRuntime,
  type WorkspaceSourceInventory,
} from "@mrclrchtr/supi-lsp/api";
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

function checkableRuntime(files = ["/project/src/clean.ts"]) {
  const service = readyRuntime();
  const checked: string[] = [];
  service.getWorkspaceDiagnosticSummary.mockImplementation(() => ({
    current: true,
    entries: [],
    evidence: {
      requested: checked.length,
      confirmed: checked.length,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: checked.map((file) => ({ file, status: "confirmed" as const })),
    },
  }));
  return Object.assign(service, {
    scanWorkspaceSources: vi.fn(
      async (): Promise<WorkspaceSourceInventory> => ({
        status: "complete" as const,
        reason: null,
        observedFileCount: files.length,
        files,
      }),
    ),
    bulkTrackFiles: vi.fn(
      async (paths: readonly string[]): Promise<BulkTrackFilesResult> => ({
        outcomes: paths.map((file) => ({ file, kind: "tracked" as const })),
      }),
    ),
    fileDiagnostics: vi.fn(
      async (
        file: string,
        _severity?: number,
        _control?: CodeRequestControl,
      ): Promise<CodeQueryResult<Diagnostic[]>> => {
        if (!checked.includes(file)) checked.push(file);
        return { kind: "completed" as const, data: [] };
      },
    ),
  });
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
  it("checks existing source files explicitly and displays clean filenames without making reload active", async () => {
    const runtime = checkableRuntime();
    const status = await openStatus();
    expect(status.render()).toContain("0/0 confirmed tracked files");
    expect(runtime.scanWorkspaceSources).not.toHaveBeenCalled();
    status.dialog.handleInput("r");
    await vi.waitFor(() => expect(status.render()).not.toContain("reloading"));
    expect(status.render()).toContain("0/0 confirmed tracked files");
    expect(runtime.scanWorkspaceSources).not.toHaveBeenCalled();

    status.dialog.handleInput("c"); // Check diagnostics
    await vi.waitFor(() => expect(status.render()).toContain("src/clean.ts"));
    expect(status.render()).toContain("1/1 confirmed tracked files");
    expect(status.render()).toContain("no errors or warnings");
    expect(runtime.fileDiagnostics).toHaveBeenCalledOnce();
    expect(status.setFooter).not.toHaveBeenCalled();
  });

  it("checks at most 32 files per action and continues with the next batch", async () => {
    const runtime = checkableRuntime(
      Array.from({ length: 33 }, (_, i) => `/project/src/file-${i + 1}.ts`),
    );
    const status = await openStatus();
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(status.render()).toContain("32/32 confirmed tracked files"));
    expect(runtime.fileDiagnostics).toHaveBeenCalledTimes(32);
    expect(status.render()).toContain("1 remaining in pass");
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(status.render()).toContain("33/33 confirmed tracked files"));
    expect(runtime.fileDiagnostics).toHaveBeenCalledTimes(33);
    expect(runtime.fileDiagnostics.mock.calls.at(-1)?.[0]).toBe("/project/src/file-33.ts");
    expect(status.render()).toContain("0 remaining in pass");
  });

  it("reports incomplete discovery without treating it as an empty clean workspace", async () => {
    const runtime = checkableRuntime();
    runtime.scanWorkspaceSources.mockResolvedValue({
      status: "limited",
      reason: "filesystem-error",
      observedFileCount: 8,
      files: [],
    });
    const status = await openStatus();
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() =>
      expect(status.render()).toContain("Source discovery incomplete: filesystem-error"),
    );
    expect(status.render()).toContain("unknown remaining");
    expect(status.render()).not.toContain("✓ no issues");
    expect(runtime.bulkTrackFiles).not.toHaveBeenCalled();
    expect(runtime.fileDiagnostics).not.toHaveBeenCalled();
  });

  it("preserves batch progress when source discovery is incomplete between checks", async () => {
    const runtime = checkableRuntime(
      Array.from({ length: 33 }, (_, i) => `/project/src/file-${i + 1}.ts`),
    );
    const status = await openStatus();
    status.dialog.handleInput("c");
    await vi.waitFor(() => expect(status.render()).toContain("32/32 confirmed tracked files"));
    runtime.scanWorkspaceSources.mockResolvedValueOnce({
      status: "limited",
      reason: "filesystem-error",
      observedFileCount: 8,
      files: [],
    });
    status.dialog.handleInput("c");
    await vi.waitFor(() => expect(status.render()).toContain("Source discovery incomplete"));
    status.dialog.handleInput("c");
    await vi.waitFor(() => expect(status.render()).toContain("src/file-33.ts"));
    expect(runtime.fileDiagnostics).toHaveBeenCalledTimes(33);
  });

  it("shows files whose routes cannot check diagnostics without labeling them clean", async () => {
    const runtime = checkableRuntime(["/project/src/unsupported.ts"]);
    runtime.bulkTrackFiles.mockResolvedValue({
      outcomes: [
        {
          file: "/project/src/unsupported.ts",
          kind: "unavailable",
          reason: "No available LSP route",
        },
      ],
    });
    const status = await openStatus();
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(status.render()).toContain("src/unsupported.ts  unavailable"));
    expect(status.render()).toContain("No available LSP route");
    expect(status.render()).not.toContain("no errors or warnings");
    expect(runtime.fileDiagnostics).not.toHaveBeenCalled();
  });

  it("retains partial check coverage at the deadline and retries the unfinished file next", async () => {
    const runtime = checkableRuntime([
      "/project/src/one.ts",
      "/project/src/two.ts",
      "/project/src/three.ts",
    ]);
    const normalCheck = runtime.fileDiagnostics.getMockImplementation();
    if (!normalCheck) throw new Error("Missing diagnostic service fixture");
    runtime.fileDiagnostics
      .mockImplementationOnce(normalCheck)
      .mockImplementationOnce(async (_file, _severity, control) => {
        throwIfCodeRequestInterrupted({ ...control, deadline: 0 });
        return { kind: "completed", data: [] };
      });
    const status = await openStatus();
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(status.render()).toContain("Check time limit reached"));
    expect(status.render()).toContain("2 remaining in pass");
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(status.render()).toContain("3/3 confirmed tracked files"));
    expect(runtime.fileDiagnostics.mock.calls.map(([file]) => file)).toEqual([
      "/project/src/one.ts",
      "/project/src/two.ts",
      "/project/src/two.ts",
      "/project/src/three.ts",
    ]);
  });

  it("aborts the active check on close and starts no more file requests", async () => {
    const runtime = checkableRuntime(["/project/src/one.ts", "/project/src/two.ts"]);
    let signal: AbortSignal | undefined;
    runtime.fileDiagnostics.mockImplementation(
      (_file, _severity, control) =>
        new Promise((_resolve, reject) => {
          signal = control?.signal;
          signal?.addEventListener("abort", () => reject(new Error("Stopped")), { once: true });
        }),
    );
    const status = await openStatus();
    const working = vi.spyOn(status.pi.events, "emit");
    status.dialog.handleInput("\x1b[15~");
    await vi.waitFor(() => expect(signal).toBeDefined());
    status.dialog.handleInput("\x1b[15~");
    expect(runtime.scanWorkspaceSources).toHaveBeenCalledOnce();
    await getHandlerOrThrow(status.pi, "session_shutdown")({}, status.ctx);
    await status.pending;
    await flushInputFrame();
    expect(signal?.aborted).toBe(true);
    expect(runtime.fileDiagnostics).toHaveBeenCalledOnce();
    expect(working).toHaveBeenCalledWith("supi:working:end", { source: "supi-code-intelligence" });
  });

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
