// LspClient refreshOpenDiagnostics settle, timeout, and deleted-file behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, type vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";
import { uriToFile } from "../../src/utils.ts";
import { createRunningTestClient } from "../helpers/client-test-harness.ts";

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

function simulatePublish(client: LspClient, uri: string, diagnostics = [makeDiagnostic("err")]) {
  client.handlePublishDiagnostics({ uri, diagnostics });
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
      setTimeout(() => simulatePublish(client, uri), publishDelay);
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

  it("times out when diagnostics keep arriving", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    openDocument(client, uri);
    const interval = setInterval(() => simulatePublish(client, uri), 30);

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

    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect(client.openFiles).not.toContain(filePath);
    expect(client.getDiagnostics(filePath)).toEqual([]);
    expect(sendNotification).toHaveBeenCalledWith(
      "textDocument/didClose",
      expect.objectContaining({ textDocument: { uri } }),
    );
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
