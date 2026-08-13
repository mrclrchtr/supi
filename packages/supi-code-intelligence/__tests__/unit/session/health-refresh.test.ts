import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type CapabilityState, completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime, WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import type { HealthRefreshAttempt } from "../../../src/session/health-types.ts";
import { runHealthWorkflow } from "../../../src/session/health-workflow.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "health-refresh-"));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function readyRuntime(overrides: Record<string, unknown> = {}): WorkspaceLspRuntime {
  return {
    getProjectServers: () => [
      {
        name: "typescript",
        root: cwd,
        fileTypes: ["ts"],
        status: "running",
        ready: true,
      },
    ],
    getOutstandingDiagnostics: () => ({ entries: [], current: true }),
    getWorkspaceDiagnosticSummary: () => ({ entries: [], current: true }),
    pruneMissingFiles: () => [],
    refreshOpenDiagnostics: async () => undefined,
    noteWorkspaceChanges: () => undefined,
    recoverDiagnostics: async () => ({
      attemptedClients: 0,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }),
    ...overrides,
  } as unknown as WorkspaceLspRuntime;
}

function capability(lspState: WorkspaceLspRuntimeState): CapabilityAdapter {
  const semantic: CapabilityState =
    lspState.kind === "unavailable"
      ? { kind: "unavailable", reason: lspState.reason }
      : { kind: "ready" };
  return {
    getLspRuntimeState: () => lspState,
    getCapabilityStates: () => ({
      semantic,
      structural: { kind: "unavailable", reason: "not configured" },
    }),
  } as unknown as CapabilityAdapter;
}

async function run(
  lspState: WorkspaceLspRuntimeState,
  input: Record<string, unknown>,
  lastRefreshAttempt: HealthRefreshAttempt | null = null,
) {
  const trackRefreshAttempt = vi.fn();
  const outcome = await runHealthWorkflow(input, {
    cwd,
    capability: capability(lspState),
    lspController: { getMissingServers: () => [] } as never,
    lastRefreshAttempt,
    trackRefreshAttempt,
    sentinelSnapshot: new Map(),
  });
  return { outcome, trackRefreshAttempt };
}

describe("code_health refresh evidence", () => {
  it("reports a zero-client refresh as a completed no-op, not recovery", async () => {
    const { outcome, trackRefreshAttempt } = await run(
      { kind: "ready", runtime: readyRuntime() },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: {
          kind: "completed",
          attemptedActiveClients: 0,
          restartedClients: 0,
          operationScope: "workspace-runtime",
        },
      },
    });
    expect(trackRefreshAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "completed", attemptedActiveClients: 0 }),
    );
  });

  it("uses a file-scoped refresh path for an exact file", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const refreshOpenDiagnostics = vi.fn(async () => undefined);
    const recoverDiagnostics = vi.fn(async () => ({
      attemptedClients: 1,
      restartedClients: 0,
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }));
    const fileDiagnostics = vi.fn(async () => completedCodeQuery([]));
    const runtime = readyRuntime({
      refreshOpenDiagnostics,
      recoverDiagnostics,
      fileDiagnostics,
      waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { scope: file, include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: {
          kind: "completed",
          operationScope: "file-runtime",
          attemptedActiveClients: 1,
        },
        diagnostics: { kind: "completed" },
      },
    });
    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: {
          staleAssessment: {
            scope: "file",
            suspected: null,
            matchedFileCount: 0,
          },
        },
      },
    });
    expect(fileDiagnostics).toHaveBeenCalledTimes(1);
    expect(refreshOpenDiagnostics).not.toHaveBeenCalled();
    expect(recoverDiagnostics).not.toHaveBeenCalled();
  });

  it("does not discard cached diagnostics for a sentinel-only file refresh", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const closeFile = vi.fn();
    const runtime = readyRuntime({
      getOutstandingDiagnostics: () => ({ entries: [], current: false }),
      closeFile,
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
      fileDiagnostics: async () => ({
        kind: "partial",
        data: [],
        reason: "Cached diagnostics are partial evidence.",
      }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { scope: file, include: ["diagnostics"], refresh: true },
    );

    expect(closeFile).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      kind: "completed",
      data: { diagnostics: { kind: "partial" } },
    });
  });

  it("records the file scope when a file refresh attempt fails", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const runtime = readyRuntime({
      getOutstandingDiagnostics: () => {
        throw new Error("file maintenance failed");
      },
      waitUntilReadyForFile: async () => ({ kind: "ready" }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { scope: file, include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: {
          kind: "failed",
          operationScope: "file-runtime",
          reason: "file maintenance failed",
        },
      },
    });
  });

  it("records a failed recovery attempt instead of collapsing it into no recovery", async () => {
    const { outcome, trackRefreshAttempt } = await run(
      {
        kind: "ready",
        runtime: readyRuntime({
          recoverDiagnostics: async () => Promise.reject(new Error("restart failed")),
        }),
      },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: { refresh: { kind: "failed", reason: "restart failed" } },
    });
    expect(trackRefreshAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failed", reason: "restart failed" }),
    );
  });

  it("reports refresh as not attempted when no ready runtime exists", async () => {
    const { outcome, trackRefreshAttempt } = await run(
      { kind: "unavailable", reason: "server crashed" },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: { kind: "not-attempted", reason: "LSP runtime unavailable — server crashed" },
      },
    });
    expect(trackRefreshAttempt).not.toHaveBeenCalled();
  });

  it("does not pretend a servers-only request asked for diagnostic refresh", async () => {
    const { outcome } = await run(
      { kind: "ready", runtime: readyRuntime() },
      { include: ["servers"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: { refresh: { kind: "not-requested", reason: "Diagnostics were not requested." } },
    });
  });
});
