// Regression coverage for issue #351: push publications stay observational.
//
// ADR 0022: push publication count is not a confirmation contract. A
// non-empty observation is visible as partial evidence, but request evidence
// is required for a confirmed result.

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

describe("push publication observation (issue #351)", () => {
  it("stays tentative after a later publication", () => {
    const file = createFile("tentative.ts");
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");

    publish(client, file.uri, [makeDiagnostic("early")]);

    // A current tentative push must not claim current snapshot or document
    // state: its data may still be replaced by a later publication (issue #351).
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
    });
    // The tentative error is useful partial evidence, but its entry stays
    // explicitly non-current until request evidence confirms it.
    expect(client.getAllDiagnostics()).toEqual([
      { uri: file.uri, diagnostics: [makeDiagnostic("early")], current: false },
    ]);
    expect(client.getDiagnostics(file.filePath)).toEqual([makeDiagnostic("early")]);

    publish(client, file.uri, [makeDiagnostic("early")]);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
    });
    expect(client.getAllDiagnostics()).toEqual([
      { uri: file.uri, diagnostics: [makeDiagnostic("early")], current: false },
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

  it("applies the tentative policy to didChange synchronizations", async () => {
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
    // The tentative timeout must not add a close/open pair
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
    // (ADR 0022). The waiter must classify a budget expiry as tentative even
    // though it never observed a publication itself (issue #351).
    publish(client, file.uri, [makeDiagnostic("early")]);
    rpc.sendNotification.mockClear();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(pending).resolves.toEqual({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("ambient evidence"),
    });
    // The tentative timeout must not add a close/open pair
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

  it("returns an observed error as partial evidence after the wait budget", async () => {
    vi.useFakeTimers();
    const file = createFile("tentative-timeout.ts");
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(pending).resolves.toEqual({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("ambient evidence"),
    });
    // The observation remains incomplete even when it contains diagnostics.
    expect(
      getDebugEvents({ source: "lsp", category: "diagnostics.timing" }).events[0]?.data,
    ).toEqual(
      expect.objectContaining({
        operation: "sync-file",
        collection: "push",
        push: "tentative",
        settle: "timed-out",
        freshness: "observed",
        outcome: "timed-out",
        timedOut: true,
        documentCount: 1,
      }),
    );
  });

  it("does not confirm single-file collection from a later publication", async () => {
    vi.useFakeTimers();
    const file = createFile("later-publication-collect.ts");
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("early")],
    });
  });

  it("does not resync retained unchanged content after a later publication", async () => {
    vi.useFakeTimers();
    const file = createFile("retained-wait.ts");
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    rpc.sendNotification.mockClear();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("early")],
    });
    expect(notificationMethods(rpc)).toEqual([]);
  });

  it("keeps a later publication observational without a new refresh", async () => {
    vi.useFakeTimers();
    const file = createFile("late-publication.ts");
    const { client, rpc } = createRunningTestClient();

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(first).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("early")],
      reason: expect.stringContaining("ambient evidence"),
    });
    rpc.sendNotification.mockClear();
    publish(client, file.uri, [makeDiagnostic("early")]);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, status: "unconfirmed" }],
    });
    expect(notificationMethods(rpc)).toEqual([]);
  });

  it("returns partial evidence to concurrent collectors", async () => {
    vi.useFakeTimers();
    const file = createFile("concurrent-waiters.ts");
    const { client, rpc } = createRunningTestClient();

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    expect(notificationMethods(rpc)).toEqual(["textDocument/didOpen"]);
    publish(client, file.uri, [makeDiagnostic("early")]);
    publish(client, file.uri, [makeDiagnostic("early")]);
    await vi.advanceTimersByTimeAsync(3_100);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "partial", data: [makeDiagnostic("early")], reason: expect.any(String) },
      { kind: "partial", data: [makeDiagnostic("early")], reason: expect.any(String) },
    ]);
  });

  it("restarts the quiet period on every publication", async () => {
    const file = createFile("quiet-restart.ts");
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    // A later publication inside the quiet window restarts the observation
    // window. The result remains unconfirmed because it is push-only.
    setTimeout(() => publish(client, file.uri, []), 30);
    setTimeout(() => publish(client, file.uri, []), 60);

    const startedAt = Date.now();
    const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 2_000, quietMs: 40 });
    const elapsed = Date.now() - startedAt;

    expect(evidence).toMatchObject({ confirmed: 0, unconfirmed: 1 });
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("push publication telemetry (ADR 0022)", () => {
  it("records a bounded per-synchronization summary for sync-file", async () => {
    vi.useFakeTimers();
    const file = createFile("summary-sync.ts");
    const { client, rpc } = createRunningTestClient({ root: os.tmpdir(), cwd: os.tmpdir() });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    publish(client, file.uri, []);
    publish(client, file.uri, []);
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });

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
              confirmed: false,
            },
          ],
        },
      }),
    ]);
    // No diagnostic payload or source text may cross into the event.
    expect(JSON.stringify(events)).not.toContain("const x = 1;");
    expect(rpc.sendNotification).toHaveBeenCalled();
  });

  it("keeps a later ambient publication observational", async () => {
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
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        message: "LSP diagnostic publication summary",
        data: expect.objectContaining({
          operation: "sync-file",
          synchronizations: [expect.objectContaining({ publications: 1, confirmed: false })],
        }),
      }),
    );
    expect(JSON.stringify(events)).not.toContain("const x = 1;");
  });

  it("records a refresh-open publication summary without file identity", async () => {
    const file = createFile("summary-refresh.ts");
    const { client } = createRunningTestClient({ root: os.tmpdir(), cwd: os.tmpdir() });
    client.didOpen(file.filePath, "const x = 1;");
    setTimeout(() => publish(client, file.uri, []), 10);
    setTimeout(() => publish(client, file.uri, []), 20);

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
          synchronizations: [expect.objectContaining({ publications: 2, confirmed: false })],
        }),
      }),
    );
    expect(event?.data).not.toHaveProperty("file");
  });
});
