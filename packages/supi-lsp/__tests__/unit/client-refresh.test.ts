// LspClient refreshOpenDiagnostics settle, timeout, and deleted-file behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { uriToFile } from "../../src/utils.ts";
import { createPullTestClient, createRunningTestClient } from "../helpers/client-test-harness.ts";

function createStartedClient(): LspClient {
  return createRunningTestClient().client;
}

function notificationMock(client: LspClient): ReturnType<typeof vi.fn> {
  return (client as unknown as { rpc: { sendNotification: ReturnType<typeof vi.fn> } }).rpc
    .sendNotification;
}

function makeDiagnostic(message: string) {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function simulatePublish(
  client: LspClient,
  uri: string,
  diagnostics = [makeDiagnostic("err")],
  versioned = false,
): void {
  const version = versioned
    ? (client.getOpenDocumentVersion(uriToFile(uri)) ?? undefined)
    : undefined;
  client.handlePublishDiagnostics({ uri, diagnostics, ...(version ? { version } : {}) });
}

function openDocument(client: LspClient, uri: string): void {
  client.didOpen(uriToFile(uri), "const value = 1;");
}

function createTempFileUri(): { tmpDir: string; uri: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
  const filePath = path.join(tmpDir, "test.ts");
  fs.writeFileSync(filePath, "const x = 1;");
  return { tmpDir, uri: `file://${filePath}` };
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));
}

describe("LspClient refreshOpenDiagnostics — settle behavior", () => {
  it("returns immediately when no documents are open", async () => {
    const client = createStartedClient();

    const start = Date.now();
    await client.refreshOpenDiagnostics({ maxWaitMs: 1000, quietMs: 50 });

    expect(Date.now() - start).toBeLessThan(500);
  });

  it("waits for a quiet window after the last diagnostic", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    openDocument(client, uri);

    try {
      const publishDelay = 30;
      // The first publication is tentative; the second publication of the
      // same synchronization confirms the document (ADR 0021).
      setTimeout(() => simulatePublish(client, uri, undefined, true), publishDelay);
      setTimeout(() => simulatePublish(client, uri, undefined, true), publishDelay + 30);
      const start = Date.now();

      await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThan(publishDelay);
      expect(elapsed).toBeLessThan(1500);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("waits to the deadline when no diagnostic observation arrives", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    openDocument(client, uri);

    try {
      const start = Date.now();
      await client.refreshOpenDiagnostics({ maxWaitMs: 200, quietMs: 80 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(elapsed).toBeLessThan(600);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("confirms a clean file through the reopen-resync fallback", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    openDocument(client, uri);
    const sendNotification = notificationMock(client);

    try {
      // The server stays silent through the first settle window, then
      // publishes twice on the fallback didOpen: the first publication is
      // tentative, the second confirms the reopened synchronization.
      setTimeout(() => client.handlePublishDiagnostics({ uri, diagnostics: [] }), 120);
      setTimeout(() => client.handlePublishDiagnostics({ uri, diagnostics: [] }), 135);
      const start = Date.now();
      const evidence = await client.refreshOpenDiagnostics({ maxWaitMs: 80, quietMs: 20 });
      const elapsed = Date.now() - start;

      expect(evidence).toMatchObject({
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file: uriToFile(uri), status: "confirmed" }],
      });
      // The reopen fallback ran after the first settle window: the total
      // wait covers the settle budget plus the bounded second settle.
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(sendNotification).toHaveBeenCalledWith("textDocument/didClose", {
        textDocument: { uri },
      });
      expect(sendNotification).toHaveBeenCalledWith(
        "textDocument/didOpen",
        expect.objectContaining({ textDocument: expect.objectContaining({ uri }) }),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps the full second-window settle budget for delayed push batches", async () => {
    vi.useFakeTimers();
    const { tmpDir, uri } = createTempFileUri();
    const client = createStartedClient();
    openDocument(client, uri);
    const sendNotification = notificationMock(client);
    sendNotification.mockClear();
    sendNotification.mockImplementation((method: string) => {
      if (method === "textDocument/didOpen") {
        // Publish twice near the end of the replacement window: the first
        // publication is tentative, the second confirms the reopened
        // synchronization within the full second-window budget.
        setTimeout(() => client.handlePublishDiagnostics({ uri, diagnostics: [] }), 2_780);
        setTimeout(() => client.handlePublishDiagnostics({ uri, diagnostics: [] }), 2_850);
      }
    });

    try {
      const pending = client.refreshOpenDiagnostics({ maxWaitMs: 3_000, quietMs: 100 });
      await vi.advanceTimersByTimeAsync(3_000);
      await vi.advanceTimersByTimeAsync(3_000);

      expect(sendNotification).toHaveBeenCalledWith(
        "textDocument/didOpen",
        expect.objectContaining({
          textDocument: expect.objectContaining({ uri }),
        }),
      );
      await expect(pending).resolves.toMatchObject({
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
      });
    } finally {
      vi.useRealTimers();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns exact confirmed and unconfirmed document coverage", async () => {
    const client = createStartedClient();
    const first = createTempFileUri();
    const second = createTempFileUri();
    openDocument(client, first.uri);
    openDocument(client, second.uri);

    try {
      // The first document republishes within the window; the second stays
      // silent and keeps the whole settle from completing.
      setTimeout(() => simulatePublish(client, first.uri, [], true), 10);
      setTimeout(() => simulatePublish(client, first.uri, [], true), 40);

      await expect(
        client.refreshOpenDiagnostics({ maxWaitMs: 80, quietMs: 10 }),
      ).resolves.toMatchObject({
        requested: 2,
        confirmed: 1,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [
          { file: uriToFile(first.uri), status: "confirmed" },
          { file: uriToFile(second.uri), status: "unconfirmed" },
        ],
      });
    } finally {
      fs.rmSync(first.tmpDir, { recursive: true, force: true });
      fs.rmSync(second.tmpDir, { recursive: true, force: true });
    }
  });

  it("does not confirm a pull that crosses a workspace invalidation", async () => {
    const file = createTempFileUri();
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.uri);
    let resolvePull!: (report: unknown) => void;
    rpc.sendRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    try {
      const pending = client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 10 });
      await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
      client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
      resolvePull({ kind: "full", items: [] });

      await expect(pending).resolves.toMatchObject({
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
      });
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects with the abort reason when cancelled during the pull phase", async () => {
    const file = createTempFileUri();
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.uri);
    const controller = new AbortController();
    rpc.sendRequest.mockImplementation(
      (_method, _params, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(options.signal.reason));
        }),
    );

    try {
      const pending = client.refreshOpenDiagnostics({
        maxWaitMs: 100,
        quietMs: 10,
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
      controller.abort(new Error("cancelled mid-refresh-pull"));

      await expect(pending).rejects.toThrow("cancelled mid-refresh-pull");
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects with the abort reason when cancelled during the settle wait", async () => {
    const file = createTempFileUri();
    const { client } = createRunningTestClient();
    openDocument(client, file.uri);
    const controller = new AbortController();

    try {
      const pending = client.refreshOpenDiagnostics({
        maxWaitMs: 1_000,
        quietMs: 50,
        signal: controller.signal,
      });
      controller.abort(new Error("cancelled during settle"));

      await expect(pending).rejects.toThrow("cancelled during settle");
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects with a deadline error when the deadline already elapsed", async () => {
    const file = createTempFileUri();
    const { client } = createRunningTestClient();
    openDocument(client, file.uri);

    try {
      await expect(
        client.refreshOpenDiagnostics({
          maxWaitMs: 100,
          quietMs: 10,
          deadline: Date.now() - 1,
        }),
      ).rejects.toThrow("Code request deadline exceeded");
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("records a failed pull separately from an unconfirmed document", async () => {
    const file = createTempFileUri();
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.uri);
    rpc.sendRequest.mockRejectedValue(new Error("pull request failed"));

    try {
      await expect(
        client.refreshOpenDiagnostics({ maxWaitMs: 40, quietMs: 10 }),
      ).resolves.toMatchObject({
        requested: 1,
        confirmed: 0,
        unconfirmed: 0,
        failed: 1,
        removed: 0,
        documents: [{ file: uriToFile(file.uri), status: "failed" }],
      });
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("records a null pull report as failed evidence", async () => {
    const file = createTempFileUri();
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.uri);
    rpc.sendRequest.mockResolvedValue(null);

    try {
      await expect(
        client.refreshOpenDiagnostics({ maxWaitMs: 40, quietMs: 10 }),
      ).resolves.toMatchObject({
        requested: 1,
        confirmed: 0,
        unconfirmed: 0,
        failed: 1,
        removed: 0,
      });
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("records malformed pull diagnostics as failed evidence", async () => {
    const file = createTempFileUri();
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.uri);
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [
        {
          message: "reversed range",
          range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } },
        },
      ],
    });

    try {
      await expect(
        client.refreshOpenDiagnostics({ maxWaitMs: 40, quietMs: 10 }),
      ).resolves.toMatchObject({
        requested: 1,
        confirmed: 0,
        unconfirmed: 0,
        failed: 1,
        removed: 0,
      });
    } finally {
      fs.rmSync(file.tmpDir, { recursive: true, force: true });
    }
  });

  it("times out when diagnostics keep arriving", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    openDocument(client, uri);
    const interval = setInterval(() => simulatePublish(client, uri, undefined, true), 30);

    try {
      const start = Date.now();
      await client.refreshOpenDiagnostics({ maxWaitMs: 200, quietMs: 100 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(elapsed).toBeLessThan(600);
    } finally {
      clearInterval(interval);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does nothing when the client is not running", async () => {
    const client = new LspClient(
      "test",
      { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
      "/project",
    );
    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });
  });

  it("uses default wait options", async () => {
    await createStartedClient().refreshOpenDiagnostics();
  });
});

describe("LspClient refreshOpenDiagnostics — file handling", () => {
  let tmpDir = "";

  afterEach(() => {
    if (!tmpDir) return;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  });

  it("re-syncs open documents from disk", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "test.ts");
    fs.writeFileSync(filePath, "const x = 1;");
    const uri = `file://${filePath}`;
    const client = createStartedClient();
    openDocument(client, uri);
    const sendNotification = notificationMock(client);

    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect(sendNotification).toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.objectContaining({
        textDocument: expect.objectContaining({ uri, version: 2 }),
        contentChanges: [{ text: "const x = 1;" }],
      }),
    );
  });

  it("closes and prunes deleted files during refresh", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "deleted.ts");
    const uri = `file://${filePath}`;
    const client = createStartedClient();
    openDocument(client, uri);
    simulatePublish(client, uri);
    const sendNotification = notificationMock(client);

    expect(client.openFiles).toContain(filePath);
    expect(client.getDiagnostics(filePath)).toHaveLength(1);

    const refresh = await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect(refresh).toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 1,
      documents: [{ file: filePath, status: "removed" }],
    });
    expect(client.openFiles).not.toContain(filePath);
    expect(client.getDiagnostics(filePath)).toEqual([]);
    expect(sendNotification).toHaveBeenCalledWith(
      "textDocument/didClose",
      expect.objectContaining({ textDocument: { uri } }),
    );
    expect(client.getDiagnosticSnapshot().documents).toEqual([]);
    await expect(client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 })).resolves.toEqual({
      requested: 0,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [],
    });
  });

  it("keeps an unreadable tracked path as failed coverage", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "unreadable.ts");
    const uri = `file://${filePath}`;
    fs.writeFileSync(filePath, "const x = 1;");
    const client = createStartedClient();
    openDocument(client, uri);
    simulatePublish(client, uri);
    fs.unlinkSync(filePath);
    fs.mkdirSync(filePath);

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: filePath, status: "failed" }],
    });
    expect(client.openFiles).toContain(filePath);
  });

  it("includes a deleted cache-only document in refresh coverage", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "related.ts");
    const uri = `file://${filePath}`;
    fs.writeFileSync(filePath, "const x = 1;");
    const client = createStartedClient();
    // A versioned publish seeds the cache for a URI the client never opened;
    // unversioned pushes for untracked URIs stay fail-closed.
    client.handlePublishDiagnostics({ uri, version: 1, diagnostics: [makeDiagnostic("err")] });
    fs.rmSync(filePath);

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 0,
      removed: 1,
      documents: [{ file: filePath, status: "removed" }],
    });
  });

  it("closes non-existent files as deleted", async () => {
    const client = createStartedClient();
    const uri = "file:///nonexistent/path.ts";
    openDocument(client, uri);

    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect(client.openFiles).not.toContain(uriToFile(uri));
  });

  it("resolves pending waiters when refresh removes deleted files", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "deleted-with-waiter.ts");
    fs.writeFileSync(filePath, "const x = 1;");
    const uri = `file://${filePath}`;
    const client = createStartedClient();
    openDocument(client, uri);
    const pending = client.syncAndWaitForDiagnostics(filePath, "const x = 2;");

    fs.rmSync(filePath);
    await client.refreshOpenDiagnostics({ maxWaitMs: 1000, quietMs: 50 });

    await expect(Promise.race([pending, timeoutAfter(250)])).resolves.toMatchObject({
      kind: "unavailable",
    });
  });
});
