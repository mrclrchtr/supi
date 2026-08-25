// Regression coverage for issue #351: push publications stay tentative
// until a later valid publication confirms the same document synchronization.
//
// ADR 0021: the first valid push publication for a synchronization is
// tentative. A republish promotes the retained cache. A tentative timeout
// must not trigger the reopen-resync fallback. Non-empty tentative data is
// visible as partial evidence, but it never enters the confirmed path.

import * as fs from "node:fs";
import * as os from "node:os";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic } from "../../src/config/types.ts";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
  type TestRpc,
} from "../helpers/client-test-harness.ts";

function makeDiagnostic(message: string): Diagnostic {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function publish(client: LspClient, uri: string, diagnostics: Diagnostic[]): void {
  client.handlePublishDiagnostics({ uri, diagnostics });
}

function notificationMethods(rpc: TestRpc): string[] {
  return rpc.sendNotification.mock.calls.map(([method]) => method as string);
}

const tempDirs: string[] = [];

beforeEach(() => {
  configureDebugRegistry({ enabled: true, maxEvents: 40 });
});

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
  resetDebugRegistry();
});

function createFile(
  name: string,
  content = "const x = 1;",
): {
  tmpDir: string;
  filePath: string;
  uri: string;
} {
  const file = createDiagnosticTestFile(name, content);
  tempDirs.push(file.tmpDir);
  return file;
}

describe("push publication confirmation (issue #351)", () => {
  it("stays tentative until a republish confirms the synchronization", () => {
    const file = createFile("tentative.ts");
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");

    publish(client, file.uri, [makeDiagnostic("early")]);

    // A current tentative push must not claim current snapshot or document
    // state: its data may still be replaced by a republish (issue #351).
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
    });
    // The tentative error is useful partial evidence, but its entry stays
    // explicitly non-current until a republish confirms it.
    expect(client.getAllDiagnostics()).toEqual([
      { uri: file.uri, diagnostics: [makeDiagnostic("early")], current: false },
    ]);
    expect(client.getDiagnostics(file.filePath)).toEqual([makeDiagnostic("early")]);

    publish(client, file.uri, [makeDiagnostic("early")]);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: true,
      documents: [{ uri: file.uri, current: true, status: "confirmed" }],
    });
    expect(client.getAllDiagnostics()).toEqual([
      { uri: file.uri, diagnostics: [makeDiagnostic("early")], current: true },
    ]);
  });

  it("removes a stale error when a repair gets a tentative empty publication", () => {
    const file = createFile("tentative-repair.ts", "const value: number = 'bad';");
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const value: number = 'bad';");
    publish(client, file.uri, [makeDiagnostic("type error")]);
    publish(client, file.uri, [makeDiagnostic("type error")]);
    expect(client.getAllDiagnostics()).toHaveLength(1);

    client.didChange(file.filePath, "const value: number = 1;");
    publish(client, file.uri, []);

    expect(client.getAllDiagnostics()).toEqual([]);
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
    });
  });

  it("applies the tentative policy to didChange and reopen synchronizations", async () => {
    vi.useFakeTimers();
    const file = createFile("sync-tentative.ts", "const before = 1;");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const before = 1;");
    rpc.sendNotification.mockClear();
    publish(client, file.uri, []);
    // A didChange opens a new synchronization: its own first publication is
    // tentative again, and a clean single publication cannot complete.
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const after = 2;");
    publish(client, file.uri, []);
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    // The tentative timeout must not reopen the document: no close/open pair
    // may cancel the server's in-flight pipeline.
    expect(notificationMethods(rpc)).not.toContain("textDocument/didClose");
    expect(notificationMethods(rpc)).not.toContain("textDocument/didOpen");
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      documents: [{ uri: file.uri, status: "unconfirmed" }],
    });
  });

  it("returns a pre-existing tentative error as partial evidence on timeout", async () => {
    vi.useFakeTimers();
    const file = createFile("pre-existing-tentative.ts");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    // One publication is cached before the wait starts; it stays tentative
    // (ADR 0021). The waiter must classify a budget expiry as tentative even
    // though it never observed a publication itself (issue #351).
    publish(client, file.uri, [makeDiagnostic("early")]);
    rpc.sendNotification.mockClear();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(pending).resolves.toEqual({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("diagnostic republish"),
    });
    // The tentative timeout must not reopen the document: no close/open pair
    // may cancel the server's in-flight pipeline.
    expect(notificationMethods(rpc)).not.toContain("textDocument/didClose");
    expect(notificationMethods(rpc)).not.toContain("textDocument/didOpen");
  });

  it("keeps a lifecycle release released after a tentative publication", async () => {
    vi.useFakeTimers();
    const file = createFile("release-after-tentative.ts");
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    // Let the released waiter's continuation re-register before the close.
    await Promise.resolve();
    // The lifecycle close releases the waiter; a tentative publication
    // observed earlier must not reclassify the release (issue #351).
    client.didClose(file.filePath);

    await expect(pending).resolves.toEqual({
      kind: "unavailable",
      reason: expect.stringContaining("ended before the current document synchronization"),
    });
  });

  it("returns a tentative error as partial evidence with a republish reason", async () => {
    vi.useFakeTimers();
    const file = createFile("tentative-timeout.ts");
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(pending).resolves.toEqual({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("diagnostic republish"),
    });
    // The existing diagnostics.timing shape stays stable; the tentative
    // outcome adds one bounded value to the push vocabulary (ADR 0021).
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        operation: "sync-file",
        collection: "push",
        push: "tentative",
        settle: "tentative",
        freshness: "observed",
        outcome: "timed-out",
        timedOut: true,
        documentCount: 1,
      }),
    );
  });

  it("completes single-file collection only after the republish", async () => {
    const file = createFile("republish-collect.ts");
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    // The first publication must not settle the collection.
    let settled = false;
    void pending.finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    // The republish promotes the retained cache and completes the wait.
    publish(client, file.uri, [makeDiagnostic("early")]);

    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("early")],
    });
  });

  it("waits for a republish without resyncing retained unchanged content", async () => {
    const file = createFile("retained-wait.ts");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    rpc.sendNotification.mockClear();

    // The retained tentative entry must not trigger a no-op didChange: that
    // would cancel the server's in-flight republish (issue #351, #344).
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notificationMethods(rpc)).toEqual([]);
    publish(client, file.uri, [makeDiagnostic("early")]);

    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("early")],
    });
    expect(notificationMethods(rpc)).toEqual([]);
  });

  it("promotes a retained tentative cache late without a new refresh", async () => {
    vi.useFakeTimers();
    const file = createFile("late-republish.ts");
    const { client, rpc } = createRunningTestClient();

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(first).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("republish"),
    });
    // The server republishes after the operation already ended: the retained
    // cache is promoted without any protocol traffic.
    rpc.sendNotification.mockClear();
    publish(client, file.uri, [makeDiagnostic("early")]);

    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(100);
    await expect(second).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("early")],
    });
    expect(notificationMethods(rpc)).toEqual([]);
  });

  it("completes concurrent collectors on one equivalent synchronization", async () => {
    const file = createFile("concurrent-waiters.ts");
    const { client, rpc } = createRunningTestClient();

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    expect(notificationMethods(rpc)).toEqual(["textDocument/didOpen"]);
    publish(client, file.uri, [makeDiagnostic("early")]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    // One republish releases every waiter for the URI (ADR 0021).
    publish(client, file.uri, [makeDiagnostic("early")]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "completed", data: [makeDiagnostic("early")] },
      { kind: "completed", data: [makeDiagnostic("early")] },
    ]);
  });

  it("restarts the quiet period on every publication", async () => {
    const file = createFile("quiet-restart.ts");
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    // The first publication is tentative; the republish arrives 150 ms
    // later. The settle must wait for the quiet window after the republish,
    // not confirm after the first publication's quiet window.
    setTimeout(() => publish(client, file.uri, []), 30);
    setTimeout(() => publish(client, file.uri, []), 180);

    const startedAt = Date.now();
    await client.refreshOpenDiagnostics({ maxWaitMs: 2_000, quietMs: 40 });
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("push publication telemetry (ADR 0021)", () => {
  it("records a bounded per-synchronization summary for sync-file", async () => {
    const file = createFile("summary-sync.ts");
    const { client, rpc } = createRunningTestClient({ root: os.tmpdir(), cwd: os.tmpdir() });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, []);
    publish(client, file.uri, []);
    await expect(pending).resolves.toEqual({ kind: "completed", data: [] });

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.publication",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic publication summary",
        cwd: os.tmpdir(),
        data: {
          operation: "sync-file",
          server: "test",
          file: expect.stringContaining("summary-sync.ts"),
          synchronizations: [
            {
              synchronizationId: expect.any(Number),
              publications: 2,
              firstReceivedAt: expect.any(Number),
              lastReceivedAt: expect.any(Number),
              confirmed: true,
            },
          ],
        },
      }),
    ]);
    // No diagnostic payload or source text may cross into the event.
    expect(JSON.stringify(events)).not.toContain("const x = 1;");
    expect(rpc.sendNotification).toHaveBeenCalled();
  });

  it("records an ambient late-republish event after an unconfirmed operation", async () => {
    vi.useFakeTimers();
    const file = createFile("ambient-late.ts");
    const { client } = createRunningTestClient({ root: os.tmpdir(), cwd: os.tmpdir() });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, []);
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });

    publish(client, file.uri, []);

    const events = getDebugEvents({
      source: "lsp",
      category: "diagnostics.publication",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP diagnostic late republish",
        data: {
          synchronizationId: expect.any(Number),
          publications: 2,
          receivedAt: expect.any(Number),
          delayMs: expect.any(Number),
          server: "test",
          file: expect.stringContaining("ambient-late.ts"),
        },
      }),
      expect.objectContaining({
        message: "LSP diagnostic publication summary",
        data: expect.objectContaining({
          operation: "sync-file",
          synchronizations: [expect.objectContaining({ publications: 1, confirmed: false })],
        }),
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("const x = 1;");
  });

  it("records a refresh-open publication summary without file identity", async () => {
    const file = createFile("summary-refresh.ts");
    const { client } = createRunningTestClient({ root: os.tmpdir(), cwd: os.tmpdir() });
    client.didOpen(file.filePath, "const x = 1;");
    setTimeout(() => publish(client, file.uri, []), 10);
    setTimeout(() => publish(client, file.uri, []), 40);

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 20 });

    const event = getDebugEvents({
      source: "lsp",
      category: "diagnostics.publication",
    }).events[0];
    expect(event).toEqual(
      expect.objectContaining({
        message: "LSP diagnostic publication summary",
        data: expect.objectContaining({
          operation: "refresh-open",
          server: "test",
          synchronizations: [expect.objectContaining({ publications: 2, confirmed: true })],
        }),
      }),
    );
    expect(event?.data).not.toHaveProperty("file");
  });
});
