import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type CapabilityState, completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceLspRuntime, WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import type { HealthRefreshAttempt } from "../../../src/session/health-types.ts";
import { runHealthWorkflow } from "../../../src/session/health-workflow.ts";

let cwd: string;

function emptyEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  } as const;
}

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
    getOutstandingDiagnostics: () => ({
      entries: [],
      current: true,
      evidence: emptyEvidence(),
    }),
    getWorkspaceDiagnosticSummary: () => ({
      entries: [],
      current: true,
      evidence: emptyEvidence(),
    }),
    pruneMissingFiles: () => [],
    refreshOpenDiagnostics: async () => emptyEvidence(),
    noteWorkspaceChanges: () => undefined,
    recoverDiagnostics: async () => ({
      attemptedClients: 0,
      restartedClients: 0,
      diagnosticEvidence: emptyEvidence(),
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
  control?: Parameters<typeof runHealthWorkflow>[2],
) {
  const trackRefreshAttempt = vi.fn();
  const outcome = await runHealthWorkflow(
    input,
    {
      cwd,
      capability: capability(lspState),
      lspController: { getMissingServers: () => [] } as never,
      lastRefreshAttempt,
      trackRefreshAttempt,
      sentinelSnapshot: new Map(),
    },
    control,
  );
  return { outcome, trackRefreshAttempt };
}

describe("code_health refresh evidence", () => {
  it("propagates final refresh evidence into partial workspace health", async () => {
    const evidence = {
      requested: 2,
      confirmed: 1,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [
        { file: "src/confirmed.ts", status: "confirmed" as const },
        { file: "src/unconfirmed.ts", status: "unconfirmed" as const },
      ],
    };
    const runtime = readyRuntime({
      getWorkspaceDiagnosticSummary: () => ({
        entries: [],
        current: false,
        evidence,
      }),
      recoverDiagnostics: async () => ({
        attemptedClients: 1,
        restartedClients: 0,
        diagnosticEvidence: evidence,
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        diagnostics: {
          kind: "partial",
          evidence,
          reason:
            "Diagnostic evidence is partial: 2 requested, 1 confirmed, 1 unconfirmed, 0 failed, 0 removed.",
        },
        refresh: { kind: "completed", diagnosticEvidence: evidence },
      },
    });
  });

  it("clears an initial refresh failure after stale-file refresh succeeds", async () => {
    const evidence = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "confirmed" as const }],
    };
    const refreshOpenDiagnostics = vi
      .fn()
      .mockRejectedValueOnce(new Error("initial refresh failed"))
      .mockResolvedValueOnce(evidence);
    const runtime = readyRuntime({
      refreshOpenDiagnostics,
      closeFile: vi.fn(),
      trackFile: vi.fn().mockResolvedValue(true),
      getOutstandingDiagnostics: () => ({
        entries: [
          {
            file: "src/a.ts",
            diagnostics: [
              {
                message: "Cannot find module 'x'",
                severity: 1,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              },
            ],
          },
        ],
        current: false,
        evidence,
      }),
      getWorkspaceDiagnosticSummary: () => ({ entries: [], current: false, evidence }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: { kind: "completed" },
        diagnostics: { evidence },
      },
    });
    expect(refreshOpenDiagnostics).toHaveBeenCalledTimes(2);
  });

  it("reports a failed workspace refresh when the host refresh rejects", async () => {
    const refreshOpenDiagnostics = vi.fn(async () => {
      throw new Error("host refresh failed");
    });
    const recoverDiagnostics = vi.fn();
    const runtime = readyRuntime({ refreshOpenDiagnostics, recoverDiagnostics });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: { kind: "failed", reason: "host refresh failed" },
      },
    });
    expect(recoverDiagnostics).not.toHaveBeenCalled();
  });

  it("rethrows an interruption instead of recording a failed attempt", async () => {
    const controller = new AbortController();
    const refreshOpenDiagnostics = vi.fn(async () => {
      controller.abort(new Error("cancelled mid-refresh"));
      throw controller.signal.reason;
    });
    const runtime = readyRuntime({ refreshOpenDiagnostics });

    await expect(
      run({ kind: "ready", runtime }, { include: ["diagnostics"], refresh: true }, null, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled mid-refresh");
  });

  it("keeps removed evidence from maintenance after recovery prunes the file", async () => {
    const removedEvidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 1,
      documents: [{ file: "src/deleted.ts", status: "removed" as const }],
    };
    const runtime = readyRuntime({
      refreshOpenDiagnostics: async () => removedEvidence,
      recoverDiagnostics: async () => ({
        attemptedClients: 0,
        restartedClients: 0,
        diagnosticEvidence: emptyEvidence(),
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: { kind: "completed", diagnosticEvidence: removedEvidence },
        diagnostics: {
          kind: "partial",
          evidence: removedEvidence,
        },
      },
    });
  });

  it("keeps failed stale-module recovery evidence after a re-open failure", async () => {
    const failedEvidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "failed" as const }],
    };
    const refreshOpenDiagnostics = vi
      .fn()
      .mockResolvedValueOnce({
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file: "src/a.ts", status: "confirmed" as const }],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src/a.ts"), "export {};");
    expect(existsSync(path.join(cwd, "src/a.ts"))).toBe(true);
    const runtime = readyRuntime({
      refreshOpenDiagnostics,
      getOutstandingDiagnostics: () => ({
        entries: [
          {
            file: path.join(cwd, "src/a.ts"),
            diagnostics: [
              {
                message: "Cannot find module 'missing'",
                severity: 1,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              },
            ],
          },
        ],
        current: false,
        evidence: failedEvidence,
      }),
      trackFile: async () => false,
      closeFile: vi.fn(),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        refresh: { kind: "completed", diagnosticEvidence: failedEvidence },
        diagnostics: { kind: "partial", evidence: failedEvidence },
      },
    });
  });

  it("preserves refresh evidence when snapshot projection fails", async () => {
    const evidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "failed" as const }],
    };
    const runtime = readyRuntime({
      refreshOpenDiagnostics: async () => evidence,
      getWorkspaceDiagnosticSummary: () => {
        throw new Error("snapshot projection failed");
      },
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        diagnostics: {
          kind: "unavailable",
          evidence,
          reason: "snapshot projection failed",
        },
      },
    });
  });

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
          diagnosticEvidence: emptyEvidence(),
        },
      },
    });
    expect(trackRefreshAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "completed", attemptedActiveClients: 0 }),
    );
  });

  it("records elapsed time in the workspace refresh attempt telemetry", async () => {
    const { trackRefreshAttempt } = await run(
      { kind: "ready", runtime: readyRuntime() },
      { include: ["diagnostics"], refresh: true },
    );

    expect(trackRefreshAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "completed",
        operationScope: "workspace-runtime",
        elapsedMs: expect.any(Number),
      }),
    );
  });

  it("preserves refresh evidence when semantic readiness is later unavailable", async () => {
    const removedEvidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 1,
      documents: [{ file: "src/deleted.ts", status: "removed" as const }],
    };
    const runtime = readyRuntime({
      getProjectServers: () => [
        {
          name: "typescript",
          root: cwd,
          fileTypes: ["ts"],
          status: "running",
          ready: false,
        },
      ],
      refreshOpenDiagnostics: async () => removedEvidence,
      recoverDiagnostics: async () => ({
        attemptedClients: 0,
        restartedClients: 0,
        diagnosticEvidence: emptyEvidence(),
        staleAssessment: { suspected: false, matchedFiles: [], warning: null },
      }),
    });

    const { outcome } = await run(
      { kind: "ready", runtime },
      { include: ["diagnostics"], refresh: true },
    );

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        diagnostics: {
          kind: "unavailable",
          evidence: removedEvidence,
        },
      },
    });
  });

  it("keeps evidence from an inactive runtime owner", async () => {
    const evidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "failed" as const }],
    };
    const runtime = readyRuntime({
      getWorkspaceDiagnosticSummary: () => ({
        entries: [],
        current: false,
        evidence,
      }),
    });

    const { outcome } = await run({ kind: "inactive", runtime }, { include: ["diagnostics"] });

    expect(outcome).toMatchObject({
      kind: "completed",
      data: {
        semanticState: { kind: "inactive" },
        diagnostics: { kind: "unavailable", evidence },
      },
    });
  });

  it("uses a file-scoped refresh path for an exact file", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const refreshOpenDiagnostics = vi.fn(async () => emptyEvidence());
    const recoverDiagnostics = vi.fn(async () => ({
      attemptedClients: 1,
      restartedClients: 0,
      diagnosticEvidence: emptyEvidence(),
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

  it("rejects a file-scoped refresh when the caller is already aborted", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const trackFile = vi.fn(async () => true);
    const runtime = readyRuntime({
      getOutstandingDiagnostics: () => ({
        entries: [
          {
            file: "source.ts",
            diagnostics: [
              {
                message: "stale",
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              },
            ],
          },
        ],
        current: true,
        evidence: emptyEvidence(),
      }),
      trackFile,
      waitUntilReadyForFile: vi.fn(async () => ({ kind: "ready" })),
    });
    const controller = new AbortController();
    controller.abort(new Error("cancelled before maintenance"));

    await expect(
      run(
        { kind: "ready", runtime },
        { scope: file, include: ["diagnostics"], refresh: true },
        null,
        { signal: controller.signal },
      ),
    ).rejects.toThrow("cancelled before maintenance");

    expect(trackFile).not.toHaveBeenCalled();
  });

  it("does not discard cached diagnostics for a sentinel-only file refresh", async () => {
    const file = path.join(cwd, "source.ts");
    writeFileSync(file, "export const value = 1;\n");
    const closeFile = vi.fn();
    const runtime = readyRuntime({
      getOutstandingDiagnostics: () => ({
        entries: [],
        current: false,
        evidence: emptyEvidence(),
      }),
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
