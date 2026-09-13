// Integration tests for TypeScript diagnostic lifecycle and refresh behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import type { Diagnostic, ServerConfig } from "../../src/config/types.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const TSSERVER = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);
const TS_SERVER_CONFIG: ServerConfig = {
  command: "typescript-language-server",
  args: ["--stdio"],
  fileTypes: ["ts"],
  rootMarkers: ["tsconfig.json", "package.json"],
  initializationOptions: { tsserver: { path: TSSERVER } },
};
const HAS_TS_LSP = hasCommand("typescript-language-server") && fs.existsSync(TSSERVER);

type RawRpc = {
  sendNotification(method: string, params: unknown): Promise<unknown>;
  sendRequest(method: string, params?: unknown, options?: unknown): Promise<unknown>;
};

function completedDiagnostics(result: { kind: string; data?: Diagnostic[] }): Diagnostic[] {
  expect(result.kind).toBe("completed");
  if (result.kind !== "completed" || result.data === undefined) {
    throw new Error(`Expected completed diagnostics, got ${result.kind}.`);
  }
  return result.data;
}

function hasError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 1);
}

describe.skipIf(!HAS_TS_LSP)("TypeScript diagnostic lifecycle integration", () => {
  let tmpDir: string;
  let client: LspClient;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-typescript-diagnostics-"));
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
        include: ["*.ts"],
      }),
    );
    client = new LspClient("typescript-language-server", TS_SERVER_CONFIG, tmpDir);
    await client.start();
    await client.getReady();
  }, 15_000);

  afterAll(async () => {
    if (client?.status === "running") await client.shutdown();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tracks open, changed, closed, and reopened TypeScript diagnostics", async () => {
    const file = path.join(tmpDir, "lifecycle.ts");
    const broken = 'export const value: number = "broken";\n';
    const fixed = "export const value: number = 1;\n";
    fs.writeFileSync(file, broken);
    client.didOpen(file, broken);

    const brokenResult = await waitFor(
      () => client.syncAndWaitForDiagnostics(file, broken),
      (result) => result.kind === "completed" && hasError(result.data),
      { timeoutMs: 10_000, retryDelayMs: 200, label: "broken lifecycle diagnostics" },
    );
    expect(hasError(completedDiagnostics(brokenResult))).toBe(true);
    expect(client.openFiles).toContain(file);

    client.didChange(file, fixed);
    const fixedResult = await waitFor(
      () => client.syncAndWaitForDiagnostics(file, fixed),
      (result) => result.kind === "completed" && result.data.length === 0,
      { timeoutMs: 10_000, retryDelayMs: 200, label: "fixed lifecycle diagnostics" },
    );
    expect(completedDiagnostics(fixedResult)).toEqual([]);

    client.didClose(file);
    expect(client.openFiles).not.toContain(file);
    client.didOpen(file, fixed);
    const reopenedResult = await client.syncAndWaitForDiagnostics(file, fixed);
    expect(reopenedResult).toEqual({ kind: "completed", data: [] });
    client.didClose(file);
  }, 35_000);

  it("invalidates a dependent file after a real dependency change", async () => {
    const dependency = path.join(tmpDir, "dependency.ts");
    const dependent = path.join(tmpDir, "dependent.ts");
    const initialDependency = "export const value: number = 1;\n";
    const changedDependency = 'export const value: string = "changed";\n';
    const dependentContent =
      'import { value } from "./dependency";\nexport const result: number = value;\n';
    fs.writeFileSync(dependency, initialDependency);
    fs.writeFileSync(dependent, dependentContent);
    client.didOpen(dependency, initialDependency);
    client.didOpen(dependent, dependentContent);

    const initialResult = await waitFor(
      () => client.syncAndWaitForDiagnostics(dependent, dependentContent),
      (result) => result.kind === "completed" && result.data.length === 0,
      { timeoutMs: 10_000, retryDelayMs: 200, label: "initial dependent diagnostics" },
    );
    expect(completedDiagnostics(initialResult)).toEqual([]);

    client.didChange(dependency, changedDependency);
    const dependencyResult = await waitFor(
      () => client.syncAndWaitForDiagnostics(dependency, changedDependency),
      (result) => result.kind === "completed",
      { timeoutMs: 10_000, retryDelayMs: 200, label: "changed dependency diagnostics" },
    );
    expect(completedDiagnostics(dependencyResult)).toEqual([]);

    client.notifyWorkspaceFileChanges([{ uri: pathToFileURL(dependency).href, type: 2 }]);
    const dependentResult = await waitFor(
      () => client.syncAndWaitForDiagnostics(dependent, dependentContent),
      (result) => result.kind === "completed" && hasError(result.data),
      { timeoutMs: 10_000, retryDelayMs: 200, label: "invalidated dependent diagnostics" },
    );
    const diagnostics = completedDiagnostics(dependentResult);
    expect(hasError(diagnostics)).toBe(true);
    expect(
      diagnostics.some(
        (item) => typeof item.message === "string" && item.message.includes("string"),
      ),
    ).toBe(true);
    client.didClose(dependency);
    client.didClose(dependent);
  }, 35_000);

  it("retains current documents without reopening them during repeated refreshes", async () => {
    const firstFile = path.join(tmpDir, "retained-first.ts");
    const secondFile = path.join(tmpDir, "retained-second.ts");
    const firstContent = "export const first: number = 1;\n";
    const secondContent = "export const second: number = 2;\n";
    fs.writeFileSync(firstFile, firstContent);
    fs.writeFileSync(secondFile, secondContent);
    client.didOpen(firstFile, firstContent);
    client.didOpen(secondFile, secondContent);

    const rpc = (client as unknown as { rpc: RawRpc }).rpc;
    const sendNotification = rpc.sendNotification.bind(rpc);
    const sendRequest = rpc.sendRequest.bind(rpc);
    const documentNotifications: string[] = [];
    let diagnosticRequests = 0;
    rpc.sendNotification = (method, params) => {
      if (method === "textDocument/didOpen" || method === "textDocument/didChange") {
        documentNotifications.push(method);
      }
      return sendNotification(method, params);
    };
    rpc.sendRequest = (method, params, options) => {
      if (method === "workspace/executeCommand") diagnosticRequests++;
      return sendRequest(method, params, options);
    };

    const firstRefresh = await client.refreshOpenDiagnostics({ maxWaitMs: 10_000, quietMs: 50 });
    expect(firstRefresh).toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(diagnosticRequests).toBe(6);
    expect(documentNotifications).toEqual([]);

    const secondRefresh = await client.refreshOpenDiagnostics({ maxWaitMs: 10_000, quietMs: 50 });
    expect(secondRefresh).toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(diagnosticRequests).toBe(12);
    expect(documentNotifications).toEqual([]);
    expect(client.getDiagnostics(firstFile)).toEqual([]);
    expect(client.getDiagnostics(secondFile)).toEqual([]);
    client.didClose(firstFile);
    client.didClose(secondFile);
  }, 35_000);
});
