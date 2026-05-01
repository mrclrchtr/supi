// Unit tests for LspClient refreshOpenDiagnostics — settle, timeout, and deleted-file behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspClient } from "../client.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
type AnyClient = any;

function createStartedClient(): LspClient {
  const client = new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    "/project",
  );
  (client as AnyClient)._status = "running";
  (client as AnyClient).rpc = { sendNotification: vi.fn() };
  return client;
}

function makeDiagnostic(message: string) {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function simulatePublish(client: LspClient, uri: string, diagnostics = [makeDiagnostic("err")]) {
  (client as AnyClient).handlePublishDiagnostics({ uri, diagnostics });
}

function setOpenDoc(client: LspClient, uri: string, version: number) {
  (client as AnyClient).openDocs.set(uri, { version, languageId: "typescript" });
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
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("waits for quiet window after last diagnostic", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    setOpenDoc(client, uri, 1);

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

  it("settles after quiet window when no diagnostics arrive", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    setOpenDoc(client, uri, 1);

    try {
      const start = Date.now();
      await client.refreshOpenDiagnostics({ maxWaitMs: 1000, quietMs: 80 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(60);
      expect(elapsed).toBeLessThan(500);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("times out when diagnostics keep arriving", async () => {
    const client = createStartedClient();
    const { tmpDir, uri } = createTempFileUri();
    setOpenDoc(client, uri, 1);

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

  it("does nothing when client is not running", async () => {
    const client = new LspClient(
      "test",
      { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
      "/project",
    );
    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });
  });

  it("uses default maxWaitMs and quietMs", async () => {
    const client = createStartedClient();
    await client.refreshOpenDiagnostics();
  });
});

describe("LspClient refreshOpenDiagnostics — file handling", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "" as string;
    }
  });

  it("re-syncs open documents from disk", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "test.ts");
    fs.writeFileSync(filePath, "const x = 1;");
    const uri = `file://${filePath}`;

    const client = createStartedClient();
    setOpenDoc(client, uri, 1);

    const sendNotification = (client as AnyClient).rpc.sendNotification;

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
    setOpenDoc(client, uri, 1);
    simulatePublish(client, uri);

    expect((client as AnyClient).openDocs.has(uri)).toBe(true);
    expect((client as AnyClient).diagnosticStore.has(uri)).toBe(true);

    const sendNotification = (client as AnyClient).rpc.sendNotification;

    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect((client as AnyClient).openDocs.has(uri)).toBe(false);
    expect((client as AnyClient).diagnosticStore.has(uri)).toBe(false);
    expect(sendNotification).toHaveBeenCalledWith(
      "textDocument/didClose",
      expect.objectContaining({ textDocument: { uri } }),
    );
  });

  it("closes non-existent files as deleted", async () => {
    const client = createStartedClient();
    const uri = "file:///nonexistent/path.ts";
    setOpenDoc(client, uri, 1);

    await client.refreshOpenDiagnostics({ maxWaitMs: 50, quietMs: 20 });

    expect((client as AnyClient).openDocs.has(uri)).toBe(false);
  });

  it("resolves pending diagnostic waiters when refresh removes deleted files", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-refresh-test-"));
    const filePath = path.join(tmpDir, "deleted-with-waiter.ts");
    fs.writeFileSync(filePath, "const x = 1;");
    const uri = `file://${filePath}`;

    const client = createStartedClient();
    setOpenDoc(client, uri, 1);
    const pending = client.syncAndWaitForDiagnostics(filePath, "const x = 2;");

    fs.rmSync(filePath);
    await client.refreshOpenDiagnostics({ maxWaitMs: 1000, quietMs: 50 });

    await expect(Promise.race([pending, timeoutAfter(250)])).resolves.toEqual([]);
  });
});
