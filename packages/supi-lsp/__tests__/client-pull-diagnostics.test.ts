// Unit tests for LSP pull diagnostic request handling and fallback behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LspClient } from "../client.ts";
import type { Diagnostic, ServerCapabilities } from "../types.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
type AnyClient = any;

function makeDiagnostic(message: string): Diagnostic {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function createPullClient(caps: Partial<ServerCapabilities> = {}): LspClient {
  const client = new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    "/project",
  );
  (client as AnyClient)._status = "running";
  (client as AnyClient).capabilities = {
    diagnosticProvider: { documentIdentifierProvider: true },
    ...caps,
  };
  (client as AnyClient).rpc = {
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  };
  return client;
}

function setOpenDoc(client: LspClient, uri: string, version: number) {
  (client as AnyClient).openDocs.set(uri, { version, languageId: "typescript" });
}

function simulatePublish(client: LspClient, uri: string, diagnostics = [makeDiagnostic("err")]) {
  (client as AnyClient).handlePublishDiagnostics({ uri, diagnostics });
}

function getCacheEntry(client: LspClient, uri: string) {
  return (client as AnyClient).diagnosticStore.get(uri);
}

function createTempTsFile(fileName: string = "test.ts", content: string = "const x = 1;") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-pull-test-"));
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, content);
  return { tmpDir, filePath, uri: `file://${filePath}` };
}

function cleanupTmpDir(tmpDir: string): void {
  if (!tmpDir) return;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("LSP pull diagnostics — refresh requests", () => {
  let tmpDir = "";

  afterEach(() => {
    cleanupTmpDir(tmpDir);
    tmpDir = "";
  });

  it("stores diagnostics from pull response", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("pull-diag-error")],
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(rpcRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ textDocument: { uri: file.uri } }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );

    const entry = getCacheEntry(client, file.uri);
    expect(entry).toBeDefined();
    expect(entry.diagnostics[0].message).toBe("pull-diag-error");
  });

  it("stores related document diagnostics from pull response", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedUri = "file:///project/related.ts";

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("main-diag")],
      relatedDocuments: {
        [relatedUri]: { kind: "full", items: [makeDiagnostic("related-diag")] },
      },
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(getCacheEntry(client, file.uri).diagnostics[0].message).toBe("main-diag");
    expect(getCacheEntry(client, relatedUri).diagnostics[0].message).toBe("related-diag");
  });

  it("sends previousResultId from the diagnostic cache", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);
    (client as AnyClient).diagnosticStore.set(file.uri, {
      diagnostics: [makeDiagnostic("existing")],
      receivedAt: Date.now() - 1000,
      resultId: "previous-1",
    });

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({ kind: "unchanged", resultId: "next-1" });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(rpcRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ previousResultId: "previous-1" }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(getCacheEntry(client, file.uri).resultId).toBe("next-1");
  });

  it("preserves cache for unchanged pull diagnostic reports", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);
    (client as AnyClient).diagnosticStore.set(file.uri, {
      diagnostics: [makeDiagnostic("existing")],
      receivedAt: Date.now() - 1000,
    });

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({ kind: "unchanged", resultId: "abc" });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(getCacheEntry(client, file.uri).diagnostics[0].message).toBe("existing");
  });

  it("stores related document diagnostics from unchanged pull response", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedUri = "file:///project/related-from-unchanged.ts";

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({
      kind: "unchanged",
      resultId: "abc",
      relatedDocuments: {
        [relatedUri]: { kind: "full", items: [makeDiagnostic("related-diag")] },
      },
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(getCacheEntry(client, relatedUri).diagnostics[0].message).toBe("related-diag");
  });
});

describe("LSP pull diagnostics — single-file syncs", () => {
  let tmpDir = "";

  afterEach(() => {
    cleanupTmpDir(tmpDir);
    tmpDir = "";
  });

  it("uses pull diagnostics for single-file syncs when available", async () => {
    const file = createTempTsFile("single-sync.ts");
    tmpDir = file.tmpDir;

    const client = createPullClient();
    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("single-sync-pull")],
    });

    const diagnostics = await client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");

    expect(rpcRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ textDocument: { uri: file.uri } }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(diagnostics[0]?.message).toBe("single-sync-pull");
  });

  it("falls back to push diagnostics for single-file syncs when pull diagnostics fail", async () => {
    const file = createTempTsFile("single-sync-fallback.ts");
    tmpDir = file.tmpDir;

    const client = createPullClient();
    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockRejectedValue(new Error("pull failed"));

    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("single-sync-push")]), 20);

    const diagnostics = await client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");

    expect(diagnostics[0]?.message).toBe("single-sync-push");
  });
});

describe("LSP pull diagnostics — refresh fallbacks", () => {
  let tmpDir = "";

  afterEach(() => {
    cleanupTmpDir(tmpDir);
    tmpDir = "";
  });

  it("falls back to push settle when pull diagnostics fail", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockRejectedValue(new Error("pull failed"));

    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback-diag")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    const entry = getCacheEntry(client, file.uri);
    expect(entry).toBeDefined();
    expect(entry.diagnostics[0].message).toBe("push-fallback-diag");
  });

  it("falls back to push settle when pull diagnostics time out", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient();
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockImplementation(
      (_method: string, _params: unknown, options: { timeoutMs?: number } = {}) =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("pull diagnostic timeout")), options.timeoutMs ?? 500),
        ),
    );

    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-timeout-diag")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    const entry = getCacheEntry(client, file.uri);
    expect(entry).toBeDefined();
    expect(entry.diagnostics[0].message).toBe("push-timeout-diag");
  });

  it("falls back to push settle when one pull diagnostic request fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-pull-test-"));
    const firstPath = path.join(tmpDir, "first.ts");
    const secondPath = path.join(tmpDir, "second.ts");
    fs.writeFileSync(firstPath, "const first = 1;");
    fs.writeFileSync(secondPath, "const second = 1;");
    const firstUri = `file://${firstPath}`;
    const secondUri = `file://${secondPath}`;

    const client = createPullClient();
    setOpenDoc(client, firstUri, 1);
    setOpenDoc(client, secondUri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    rpcRequest.mockImplementation((_method: string, params: { textDocument: { uri: string } }) => {
      if (params.textDocument.uri === firstUri) {
        return Promise.resolve({ kind: "full", items: [makeDiagnostic("pull-first-diag")] });
      }
      return Promise.reject(new Error("pull failed"));
    });

    setTimeout(() => simulatePublish(client, secondUri, [makeDiagnostic("push-second-diag")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(getCacheEntry(client, firstUri).diagnostics[0].message).toBe("pull-first-diag");
    expect(getCacheEntry(client, secondUri).diagnostics[0].message).toBe("push-second-diag");
  });

  it("uses push settle when server does not support diagnosticProvider", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;

    const client = createPullClient({});
    (client as AnyClient).capabilities = {};
    setOpenDoc(client, file.uri, 1);

    const rpcRequest = (client as AnyClient).rpc.sendRequest;
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-diag")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(rpcRequest).not.toHaveBeenCalledWith("textDocument/diagnostic", expect.anything());

    const entry = getCacheEntry(client, file.uri);
    expect(entry.diagnostics[0].message).toBe("push-diag");
  });
});
