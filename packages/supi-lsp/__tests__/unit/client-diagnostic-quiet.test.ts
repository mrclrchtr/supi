// Push diagnostic evidence must complete its quiet period before one refresh
// reports it as confirmed (ADR 0021).

import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function notificationUris(
  calls: ReadonlyArray<readonly unknown[]>,
  method: string,
): Array<string | undefined> {
  return calls
    .filter(([actualMethod]) => actualMethod === method)
    .map(([, params]) => (params as { textDocument?: { uri?: string } }).textDocument?.uri);
}

describe("push diagnostic quiet confirmation", () => {
  it("keeps a near-deadline republish unconfirmed for the current refresh", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("near-deadline.ts");
    tempDirs.push(file.tmpDir);
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    setTimeout(() => client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] }), 10);
    setTimeout(() => client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] }), 70);

    const pending = client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 80 });
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      documents: [{ file: file.filePath, status: "unconfirmed" }],
    });
    // The later publication still promotes the retained cache for a future
    // refresh without new protocol traffic.
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: true,
      documents: [{ uri: file.uri, current: true, status: "confirmed" }],
    });
  });

  it("does not restart the full wait budget for an aged tentative publication", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("aged-tentative.ts");
    tempDirs.push(file.tmpDir);
    const { client } = createRunningTestClient();

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] });
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(first).resolves.toMatchObject({ kind: "unavailable" });

    const second = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;");
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("diagnostic republish"),
    });
  });

  it("reopens only silent documents in a mixed tentative batch", async () => {
    vi.useFakeTimers();
    const first = createDiagnosticTestFile("tentative.ts");
    const second = createDiagnosticTestFile("silent.ts");
    tempDirs.push(first.tmpDir, second.tmpDir);
    const { client, rpc } = createRunningTestClient();
    client.didOpen(first.filePath, "const first = 1;");
    client.didOpen(second.filePath, "const second = 2;");
    client.notifyWorkspaceFileChanges([{ uri: first.uri, type: 2 }]);
    rpc.sendNotification.mockClear();
    rpc.sendNotification.mockImplementation((method: string, params: unknown) => {
      const uri = (params as { textDocument?: { uri?: string } }).textDocument?.uri;
      if (method === "textDocument/didChange" && uri === first.uri) {
        client.handlePublishDiagnostics({ uri, diagnostics: [] });
      }
      if (method === "textDocument/didOpen" && uri === second.uri) {
        client.handlePublishDiagnostics({ uri, diagnostics: [] });
        client.handlePublishDiagnostics({ uri, diagnostics: [] });
      }
    });

    const pending = client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).resolves.toMatchObject({
      requested: 2,
      confirmed: 1,
      unconfirmed: 1,
      documents: expect.arrayContaining([
        { file: first.filePath, status: "unconfirmed" },
        { file: second.filePath, status: "confirmed" },
      ]),
    });
    const calls = rpc.sendNotification.mock.calls;
    expect(notificationUris(calls, "textDocument/didClose")).toEqual([second.uri]);
    expect(notificationUris(calls, "textDocument/didOpen")).toEqual([second.uri]);
  });
});
