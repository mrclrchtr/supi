// LspClient pull diagnostic request handling and fallback behavior.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic } from "../../src/config/types.ts";
import { uriToFile } from "../../src/utils.ts";
import {
  createPullTestClient,
  createRunningTestClient,
  createDiagnosticTestFile as createTempTsFile,
} from "../helpers/client-test-harness.ts";

function makeDiagnostic(message: string): Diagnostic {
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

  it("stores diagnostics from a gopls-style report with an empty kind", async () => {
    // gopls v0.23.0 sends `kind: ""` (the discriminator is never set) with no
    // resultId; the empty kind is tolerated as a full report.
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "",
      items: [makeDiagnostic("gopls-pull-diag")],
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("gopls-pull-diag");
  });

  it("stores diagnostics from a report with a missing kind", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      items: [makeDiagnostic("no-kind-diag")],
    });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("no-kind-diag");
  });

  it("fails closed on a report with an unknown kind", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "bogus",
      items: [makeDiagnostic("never-stored")],
    });
    setTimeout(
      () => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback")], true),
      20,
    );
    setTimeout(
      () => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback")], true),
      60,
    );

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("push-fallback");
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

  it("keeps current evidence for an open related document", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedFile = path.join(tmpDir, "related.ts");
    fs.writeFileSync(relatedFile, "const related = 1;\n");
    const relatedUri = `file://${relatedFile}`;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    openDocument(client, relatedFile);

    let resolveFirst: (value: unknown) => void = () => undefined;
    const firstResponse = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("related-current")],
      });

    const refresh = client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    await Promise.resolve();
    resolveFirst({
      kind: "full",
      items: [makeDiagnostic("main-current")],
      relatedDocuments: {
        [relatedUri]: { kind: "full", items: [makeDiagnostic("related-old")] },
      },
    });
    await expect(refresh).resolves.toMatchObject({
      requested: 2,
      confirmed: 2,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });
    expect(client.getDiagnostics(relatedFile)[0]?.message).toBe("related-current");
  });

  it("does not resurrect related diagnostics after close and reopen", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedFile = path.join(tmpDir, "related.ts");
    fs.writeFileSync(relatedFile, "const related = 1;\n");
    const relatedUri = `file://${relatedFile}`;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    openDocument(client, relatedFile);

    let resolveMain: (value: unknown) => void = () => undefined;
    const mainResponse = new Promise<unknown>((resolve) => {
      resolveMain = resolve;
    });
    rpc.sendRequest
      .mockImplementationOnce(() => mainResponse)
      .mockResolvedValueOnce({ kind: "full", items: [makeDiagnostic("related-current")] });

    const refresh = client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
    await Promise.resolve();
    client.didClose(relatedFile);
    openDocument(client, relatedFile);
    resolveMain({
      kind: "full",
      items: [makeDiagnostic("main-current")],
      relatedDocuments: {
        [relatedUri]: { kind: "full", items: [makeDiagnostic("related-stale")] },
      },
    });
    await refresh;

    expect(client.getDiagnostics(relatedFile)).toEqual([]);
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

  it("rejects nested related pull reports", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedUri = `file://${path.join(tmpDir, "related.ts")}`;
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [],
      relatedDocuments: {
        [relatedUri]: {
          kind: "full",
          items: [],
          relatedDocuments: { [file.uri]: { kind: "full", items: [] } },
        },
      },
    });

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 40, quietMs: 10 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
    });
    expect(client.getDiagnostics(uriToFile(relatedUri))).toEqual([]);
  });

  it("stores related diagnostics from unchanged pull reports", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const relatedFile = "/project/related-from-unchanged.ts";
    const { client, rpc } = createPullTestClient();
    openDocument(client, file.filePath);
    rpc.sendRequest
      .mockResolvedValueOnce({ kind: "full", items: [], resultId: "before" })
      .mockResolvedValueOnce({
        kind: "unchanged",
        resultId: "after",
        relatedDocuments: {
          [`file://${relatedFile}`]: {
            kind: "full",
            items: [makeDiagnostic("related-diag")],
          },
        },
      });

    await client.refreshOpenDiagnostics({ maxWaitMs: 500, quietMs: 50 });
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
    setTimeout(
      () => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback")], true),
      20,
    );
    setTimeout(
      () => simulatePublish(client, file.uri, [makeDiagnostic("push-fallback")], true),
      60,
    );

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
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-timeout")], true), 20);
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-timeout")], true), 60);

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
    setTimeout(() => simulatePublish(client, secondUri, [makeDiagnostic("push-second")], true), 20);
    setTimeout(() => simulatePublish(client, secondUri, [makeDiagnostic("push-second")], true), 60);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(client.getDiagnostics(firstPath)[0]?.message).toBe("pull-first");
    expect(client.getDiagnostics(secondPath)[0]?.message).toBe("push-second");
  });

  it("uses push settle when the server has no diagnostic provider", async () => {
    const file = createTempTsFile();
    tmpDir = file.tmpDir;
    const { client, rpc } = createRunningTestClient();
    openDocument(client, file.filePath);
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-diag")], true), 20);
    setTimeout(() => simulatePublish(client, file.uri, [makeDiagnostic("push-diag")], true), 60);

    await client.refreshOpenDiagnostics({ maxWaitMs: 2000, quietMs: 80 });

    expect(rpc.sendRequest).not.toHaveBeenCalled();
    expect(client.getDiagnostics(file.filePath)[0]?.message).toBe("push-diag");
  });
});
