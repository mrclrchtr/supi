// LspClient pull diagnostic request handling and fallback behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic } from "../../src/config/types.ts";
import { createPullTestClient, createRunningTestClient } from "../helpers/client-test-harness.ts";

function makeDiagnostic(message: string): Diagnostic {
  return {
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

function simulatePublish(client: LspClient, uri: string, diagnostics = [makeDiagnostic("err")]) {
  client.handlePublishDiagnostics({ uri, diagnostics });
}

function createTempTsFile(fileName = "test.ts", content = "const x = 1;") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-pull-test-"));
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, content);
  return { tmpDir, filePath, uri: `file://${filePath}` };
}

function openDocument(client: LspClient, filePath: string): void {
  client.didOpen(filePath, fs.readFileSync(filePath, "utf-8"));
}

function cleanupTmpDir(tmpDir: string): void {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("LSP pull diagnostics — refresh requests", () => {
  let tmpDir = "";

  afterEach(() => {
    cleanupTmpDir(tmpDir);
    tmpDir = "";
  });

  it("stores diagnostics from a pull response", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("pull-diag-error")],
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(rpc.sendRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ textDocument: { uri: file.uri } }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("pull-diag-error");
  });

  it("stores related document diagnostics from a pull response", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedFile = "/project/related.ts";
    const relatedUri = `file://${relatedFile}`;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("main-diag")],
      relatedDocuments: {
        [relatedUri]: { kind: "full", items: [makeDiagnostic("related-diag")] },
      },
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("main-diag");
    expect(client.getDiagnostics(relatedFile)[0]?.message).toBe("related-diag");
  });

  it("carries pull result IDs across refreshes", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("existing")],
        resultId: "previous-1",
      })
      .mockResolvedValueOnce({ kind: "unchanged", resultId: "next-1" })
      .mockResolvedValueOnce({ kind: "unchanged", resultId: "next-2" });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(rpc.sendRequest).toHaveBeenNthCalledWith(
      2,
      "textDocument/diagnostic",
      expect.objectContaining({ previousResultId: "previous-1" }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(rpc.sendRequest).toHaveBeenNthCalledWith(
      3,
      "textDocument/diagnostic",
      expect.objectContaining({ previousResultId: "next-1" }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("preserves diagnostics for unchanged pull reports", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("existing")],
        resultId: "before",
      })
      .mockResolvedValueOnce({ kind: "unchanged", resultId: "after" });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("existing");
  });

  it("stores related diagnostics from unchanged pull reports", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedFile = "/project/related-from-unchanged.ts";
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "unchanged",
      resultId: "abc",
      relatedDocuments: {
        [`file://${relatedFile}`]: {
          kind: "full",
          items: [makeDiagnostic("related-diag")],
        },
      },
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(relatedFile)[0]?.message).toBe("related-diag");
  });

  it("clears pull result IDs without clearing diagnostics", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("existing")],
        resultId: "before",
      })
      .mockResolvedValueOnce({ kind: "full", items: [makeDiagnostic("after-clear")] });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    client.clearPullResultIds();
    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(rpc.sendRequest).toHaveBeenNthCalledWith(
      2,
      "textDocument/diagnostic",
      expect.objectContaining({ previousResultId: undefined }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("after-clear");
  });
});

describe("LSP pull diagnostics — single-file syncs", () => {
  let tmpDir = "";

  afterEach(() => {
    cleanupTmpDir(tmpDir);
    tmpDir = "";
  });

  it("uses pull diagnostics for a single-file sync", async () => {
    const file = createTempTsFile("single-sync.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("single-sync-pull")],
    });

    const diagnostics = await client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");

    expect(rpc.sendRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ textDocument: { uri: file.uri } }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(diagnostics[0]?.message).toBe("single-sync-pull");
  });

  it("falls back to push diagnostics when a pull fails", async () => {
    const file = createTempTsFile("single-sync-fallback.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));
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

  it("falls back to push settle when a pull fails", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("push-fallback");
  });

  it("falls back to push settle when a pull times out", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockImplementation(
      (_method: string, _params: unknown, options: { timeoutMs?: number } = {}) =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("pull diagnostic timeout")), options.timeoutMs ?? 500),
        ),
    );
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-timeout")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("push-timeout");
  });

  it("falls back to push settle when one pull request fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-pull-test-"));
    const firstPath = path.join(tmpDir, "first.ts");
    const secondPath = path.join(tmpDir, "second.ts");
    fs.writeFileSync(firstPath, "const first = 1;");
    fs.writeFileSync(secondPath, "const second = 1;");
    const firstUri = `file://${firstPath}`;
    const secondUri = `file://${secondPath}`;
    const { client, rpc } = createPullTestClient();
    openDocument(client, firstPath);
    openDocument(client, secondPath);
    rpc.sendRequest.mockImplementation(
      (_method: string, params: { textDocument: { uri: string } }) => {
        if (params.textDocument.uri === firstUri) {
          return Promise.resolve({ kind: "full", items: [makeDiagnostic("pull-first")] });
        }
        return Promise.reject(new Error("pull failed"));
      },
    );
    setTimeout(() => simulatePublish(client, secondUri, [makeDiagnostic("push-second")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(client.getDiagnostics(firstPath)[0]?.message).toBe("pull-first");
    expect(client.getDiagnostics(secondPath)[0]?.message).toBe("push-second");
  });

  it("uses push settle when the server has no diagnostic provider", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createRunningTestClient();
    openDocument(client, file.filePath);
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-diag")]), 20);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("push-diag");
  });
});
