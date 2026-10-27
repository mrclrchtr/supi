import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setWorkspaceLspRuntimeState, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { sessionCache } from "../../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let cwd: string;
const empty = { requested: 0, confirmed: 0, unconfirmed: 0, failed: 0, removed: 0, documents: [] };
interface Tool {
  outputSchema: TSchema;
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
    details: unknown;
  }>;
}
function tool() {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
  return getTool(pi, "code_health") as unknown as Tool;
}
async function call(t: Tool, params: unknown, signal?: AbortSignal) {
  const result = await t.execute("health", params, signal, undefined, makeCtx({ cwd }));
  const json = JSON.parse(JSON.stringify(result.structuredContent));
  expect(json).toEqual(result.structuredContent);
  expect([...Value.Errors(t.outputSchema, json)]).toEqual([]);
  return result;
}
function ready(overrides: Record<string, unknown> = {}) {
  const summary = { entries: [], current: true, evidence: empty };
  const runtime = {
    getProjectServers: () => [
      { name: "ts", root: cwd, fileTypes: ["ts"], status: "running", ready: true },
    ],
    getWorkspaceDiagnosticSummary: () => summary,
    getOutstandingDiagnostics: () => summary,
    waitUntilReadyForFile: async () => ({ kind: "ready" }),
    pruneMissingFiles: () => [],
    refreshOpenDiagnostics: async () => empty,
    noteWorkspaceChanges: () => {},
    syncWorkspaceSentinelSnapshot: (previous: Map<string, number>) => ({
      snapshot: previous,
      changes: [],
    }),
    scanWorkspaceSources: async () => ({
      status: "complete",
      reason: null,
      observedFileCount: 0,
      files: [],
    }),
    bulkTrackFiles: async () => ({ outcomes: [] }),
    recoverDiagnostics: async () => ({
      attemptedClients: 1,
      restartedClients: 0,
      diagnosticEvidence: empty,
      diagnosticReport: { summary, outstanding: summary },
      processCrashRecovery: {
        recoveredRoutes: 1,
        skippedRoutes: 0,
        failedRoutes: 0,
        exhaustedRoutes: 0,
        entries: [{ name: "ts", root: ".", outcome: "recovered" }],
        omittedEntries: 0,
      },
      startupRetry: { recoveredRoutes: 0, failedRoutes: 0, entries: [], omittedEntries: 0 },
      staleAssessment: { suspected: false, matchedFiles: [], warning: null },
    }),
    ...overrides,
  };
  setWorkspaceLspRuntimeState(cwd, {
    kind: "ready",
    runtime: runtime as unknown as WorkspaceLspRuntime,
  });
}
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "health-structured-"));
  registerMockProvider(cwd);
});
afterEach(() => {
  clearMockRuntime();
  rmSync(cwd, { recursive: true, force: true });
});

describe("registered health structured results", () => {
  it("distinguishes empty observations, omitted sections, and invalid input", async () => {
    ready();
    const t = tool();
    const result = await call(t, {});
    expect(result.structuredContent).toMatchObject({
      kind: "completed",
      level: "summary",
      includedSections: ["diagnostics", "servers"],
      diagnostics: {
        kind: "completed",
        entries: [],
        evidence: empty,
        scope: { kind: "tracked-files", filter: null },
      },
      serverInventoryScope: "workspace",
      serverInventoryAvailable: true,
      diagnosticMessageLimitPerFile: 3,
    });
    expect(result.content[0].text).toContain("Health");
    const missingDiagnostics = structuredClone(result.structuredContent);
    delete missingDiagnostics.diagnostics;
    expect(Value.Check(t.outputSchema, missingDiagnostics)).toBe(false);
    expect(Value.Check(t.outputSchema, { ...result.structuredContent, privateState: {} })).toBe(
      false,
    );
    const selected = await call(t, { include: ["servers"] });
    expect(selected.structuredContent).toMatchObject({
      diagnostics: { kind: "not-requested", entries: [] },
      includedSections: ["servers"],
    });
    const invalid = await call(t, { include: ["not-a-section"] });
    expect(Object.keys(invalid.structuredContent).sort((a, b) => a.localeCompare(b))).toEqual([
      "kind",
      "message",
    ]);
    expect(invalid.structuredContent.kind).toBe("invalid-input");
  });
  it("explains zero-document partial evidence without treating an empty result as clean", async () => {
    ready({
      getWorkspaceDiagnosticSummary: () => ({ entries: [], current: false, evidence: empty }),
    });
    const result = await call(tool(), {});
    expect(result.structuredContent).toMatchObject({
      diagnostics: { kind: "partial", entries: [], evidence: empty },
    });
    const { reason } = result.structuredContent.diagnostics as { reason: string };
    expect(reason).toMatch(/no document-level diagnostic evidence/i);
    expect(reason).toMatch(/does not establish.*clean/i);
    expect(reason).toMatch(/exact file/i);
    expect(result.content[0].text).toContain(reason);
  });

  it("retains partial evidence independently of server scope and exposes rich server capabilities", async () => {
    const evidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "unconfirmed", secret: "private" }],
    };
    ready({
      getWorkspaceDiagnosticSummary: () => ({
        entries: [{ file: "src/a.ts", errors: 2, warnings: 0 }],
        current: false,
        evidence,
      }),
      getProjectServers: () => [
        {
          name: "ts",
          root: cwd,
          fileTypes: ["ts"],
          status: "running",
          ready: true,
          openFiles: ["private"],
          operationSupport: {
            rename_symbol: { server: "advertised", supi: "supported", secret: "private" },
          },
        },
      ],
    });
    const result = await call(tool(), {});
    expect(result.structuredContent).toMatchObject({
      diagnostics: {
        kind: "partial",
        evidence: { unconfirmed: 1, documents: [{ file: "src/a.ts", status: "unconfirmed" }] },
      },
      servers: [
        { operationSupport: { rename_symbol: { server: "advertised", supi: "supported" } } },
      ],
    });
    expect(JSON.stringify(result.structuredContent)).not.toMatch(
      /secret|private|openFiles|operationId/,
    );
  });
  it("preserves exact file observation, scope decision, and 1-based message lines", async () => {
    const file = join(cwd, "index.ts");
    writeFileSync(file, "const x = 1;\n");
    ready({
      fileDiagnostics: async () => ({
        kind: "partial",
        reason: "still indexing",
        data: [
          {
            severity: 2,
            source: "test",
            message: "warning",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          },
        ],
      }),
    });
    const result = await call(tool(), { scope: "index.ts", level: "detailed" });
    expect(result.structuredContent).toMatchObject({
      diagnostics: {
        kind: "partial",
        scope: { kind: "file", path: file },
        scopeStatus: { status: "no-config", basis: null },
        evidence: { unconfirmed: 1 },
        entries: [
          { file, warnings: 1, messages: [{ line: 1, severity: "warning", source: "test" }] },
        ],
      },
      serverInventoryScope: "workspace",
    });
  });
  it("reports unavailable diagnostics and unattempted refresh without inventing confirmation", async () => {
    setWorkspaceLspRuntimeState(cwd, { kind: "unavailable", reason: "offline" });
    const result = await call(tool(), { refresh: true });
    expect(result.structuredContent).toMatchObject({
      semanticState: { kind: "unavailable", reason: "offline" },
      diagnostics: { kind: "unavailable", evidence: empty },
      serverInventoryAvailable: false,
      servers: [],
      refresh: { kind: "not-attempted", lastAttempt: null },
    });
  });
  it("keeps maintenance recovery separate from diagnostic confirmation", async () => {
    ready();
    const result = await call(tool(), { refresh: true });
    expect(result.structuredContent).toMatchObject({
      diagnostics: { kind: "completed", evidence: empty },
      refresh: {
        kind: "completed",
        operationScope: "workspace-runtime",
        diagnosticEvidence: empty,
        processCrashRecovery: { recoveredRoutes: 1, entries: [{ outcome: "recovered" }] },
        sourceTracking: { status: "complete" },
      },
    });
  });
  it("retains a failed refresh as a separate last attempt on the next call", async () => {
    ready({
      scanWorkspaceSources: async () => {
        throw new Error("source scan failed");
      },
    });
    const t = tool();
    const failed = await call(t, { refresh: true });
    expect(failed.structuredContent).toMatchObject({
      refresh: {
        kind: "failed",
        reason: "source scan failed",
        operationScope: "workspace-runtime",
      },
      diagnostics: { kind: "completed" },
    });
    const next = await call(t, {});
    expect(next.structuredContent).toMatchObject({
      refresh: {
        kind: "not-requested",
        lastAttempt: { kind: "failed", reason: "source scan failed" },
      },
    });
  });
  it("returns every collected file and server beyond text bounds while preserving the per-file message limit", async () => {
    const count = 240;
    const files = Array.from({ length: count }, (_, i) => ({
      file: `file-${i}-${"x".repeat(220)}.ts`,
      diagnostics: Array.from({ length: 5 }, (_, j) => ({
        severity: 1,
        message: `message-${j}`,
        range: { start: { line: j, character: 0 }, end: { line: j, character: 1 } },
      })),
    }));
    const evidence = {
      requested: count,
      confirmed: count,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: files.map(({ file }) => ({ file, status: "confirmed" })),
    };
    ready({
      getOutstandingDiagnostics: () => ({ entries: files, current: true, evidence }),
      getProjectServers: () =>
        Array.from({ length: count }, (_, i) => ({
          name: `server-${i}`,
          root: cwd,
          fileTypes: ["ts"],
          status: "running",
          ready: true,
        })),
    });
    const result = await call(tool(), { level: "detailed" });
    const diagnostics = result.structuredContent.diagnostics as {
      entries: Array<{ messages: unknown[] }>;
    };
    expect(diagnostics.entries).toHaveLength(count);
    expect(diagnostics.entries[0].messages).toHaveLength(3);
    expect(result.structuredContent.servers).toHaveLength(count);
    expect(result.content[0].text.length).toBeLessThan(
      JSON.stringify(result.structuredContent).length,
    );
    const spill = (result.details as { truncation?: { fullOutputPath?: string } }).truncation
      ?.fullOutputPath;
    expect(spill).toBeDefined();
    if (spill) rmSync(dirname(spill), { recursive: true, force: true });
  });
  it("propagates execution failures and cancellation", async () => {
    ready({
      getProjectServers: () => {
        throw new Error("provider failed");
      },
    });
    await expect(
      tool().execute("error", {}, undefined, undefined, makeCtx({ cwd })),
    ).rejects.toThrow("provider failed");
    ready();
    const controller = new AbortController();
    controller.abort();
    await expect(
      tool().execute("cancel", {}, controller.signal, undefined, makeCtx({ cwd })),
    ).rejects.toThrow();
  });
});
