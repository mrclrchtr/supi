import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic } from "../../src/config/types.ts";
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

function publish(client: LspClient, uri: string, diagnostics: Diagnostic[]): void {
  client.handlePublishDiagnostics({ uri, diagnostics });
}

describe("LSP single-file diagnostic freshness", () => {
  let tmpDir = "";

  afterEach(() => {
    vi.useRealTimers();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  });

  it("returns unavailable when a silent server does not confirm diagnostics", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("silent-sync.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("not confirmed"),
    });
  });

  it("returns stale cached diagnostics as partial evidence after timeout", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("stale-sync.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    publish(client, file.uri, [makeDiagnostic("cached")]);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;");
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("cached")],
      reason: expect.stringContaining("cached diagnostics"),
    });
  });

  it("keeps a stale empty cache partial instead of confirming a clean result", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("stale-empty.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    publish(client, file.uri, []);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;");
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toMatchObject({ kind: "partial", data: [] });
  });

  it("completes a clean result from a full pull report", async () => {
    const file = createTempTsFile("clean-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });

    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [],
    });
  });

  it("does not let a delayed push from a closed document confirm its reopen", async () => {
    const file = createTempTsFile("reopened.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    const closedVersion = client.getOpenDocumentVersion(file.filePath);
    if (closedVersion === null) throw new Error("Expected an open document version.");
    client.didClose(file.filePath);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;");
    client.handlePublishDiagnostics({
      uri: file.uri,
      version: closedVersion,
      diagnostics: [makeDiagnostic("closed")],
    });
    const reopenedVersion = client.getOpenDocumentVersion(file.filePath);
    if (reopenedVersion === null) throw new Error("Expected a reopened document version.");
    expect(reopenedVersion).toBeGreaterThan(closedVersion);
    client.handlePublishDiagnostics({
      uri: file.uri,
      version: reopenedVersion,
      diagnostics: [makeDiagnostic("current")],
    });

    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
  });

  it("completes only after a versioned push matches the synchronized document", async () => {
    const file = createTempTsFile("versioned-push.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    let settled = false;

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;").finally(() => {
      settled = true;
    });
    const version = client.getOpenDocumentVersion(file.filePath);
    if (version === null) throw new Error("Expected an open document version.");
    client.handlePublishDiagnostics({
      uri: file.uri,
      version: version + 1,
      diagnostics: [makeDiagnostic("future")],
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    client.handlePublishDiagnostics({
      uri: file.uri,
      version,
      diagnostics: [makeDiagnostic("current")],
    });
    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
  });

  it("accepts an unversioned empty push observed after synchronization", async () => {
    const file = createTempTsFile("unversioned-push.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] });

    await expect(pending).resolves.toEqual({ kind: "completed", data: [] });
  });

  it("uses a full pull report for the synchronized document", async () => {
    const file = createTempTsFile("single-sync.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [makeDiagnostic("single-sync-pull")],
    });

    const result = await client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");

    expect(rpc.sendRequest).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({ textDocument: { uri: file.uri } }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(result).toEqual({
      kind: "completed",
      data: [makeDiagnostic("single-sync-pull")],
    });
  });

  it("accepts unchanged pull evidence linked to the prior result", async () => {
    const file = createTempTsFile("valid-unchanged.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("existing")],
        resultId: "before",
      })
      .mockResolvedValueOnce({ kind: "unchanged", resultId: "after" });

    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("existing")],
    });
    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;")).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("existing")],
    });
    expect(rpc.sendRequest).toHaveBeenNthCalledWith(
      2,
      "textDocument/diagnostic",
      expect.objectContaining({ previousResultId: "before" }),
      expect.any(Object),
    );
  });

  it("rejects an unchanged pull report without a prior result", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("invalid-unchanged.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({ kind: "unchanged", resultId: "unlinked" });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("does not let a delayed pull confirm an older synchronization", async () => {
    const file = createTempTsFile("delayed-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    let resolveFirst!: (report: unknown) => void;
    rpc.sendRequest
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        kind: "full",
        items: [makeDiagnostic("current")],
      });

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;");

    await expect(second).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
    resolveFirst({ kind: "full", items: [makeDiagnostic("stale")] });

    await expect(first).resolves.toMatchObject({ kind: "unavailable" });
    expect(client.getDiagnostics(file.filePath)).toEqual([makeDiagnostic("current")]);
  });

  it("completes from a fresh push without waiting for a silent pull", async () => {
    const file = createTempTsFile("silent-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockImplementation(() => new Promise(() => {}));

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    publish(client, file.uri, [makeDiagnostic("push")]);

    await expect(
      Promise.race([
        pending,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("diagnostic collection did not finish")), 250),
        ),
      ]),
    ).resolves.toEqual({ kind: "completed", data: [makeDiagnostic("push")] });
  });

  it("releases a silent pull when the document closes", async () => {
    const file = createTempTsFile("closed-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockImplementation(() => new Promise(() => {}));

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didClose(file.filePath);

    await expect(
      Promise.race([
        pending,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("diagnostic collection did not finish")), 250),
        ),
      ]),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("releases a silent pull when pruning a removed document", async () => {
    const file = createTempTsFile("pruned-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockImplementation(() => new Promise(() => {}));

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    fs.rmSync(file.filePath);
    expect(client.pruneMissingFiles()).toEqual([file.filePath]);

    await expect(
      Promise.race([
        pending,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("diagnostic collection did not finish")), 250),
        ),
      ]),
    ).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("accepts a push observed while pull diagnostics are failing", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("push-during-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockImplementation(
      () =>
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("pull failed")), 30)),
    );
    setTimeout(() => publish(client, file.uri, [makeDiagnostic("fresh-push")]), 10);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(30);

    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("fresh-push")],
    });
  });

  it("falls back to a fresh push when pull diagnostics fail", async () => {
    const file = createTempTsFile("single-sync-fallback.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));
    setTimeout(() => publish(client, file.uri, [makeDiagnostic("single-sync-push")]), 20);

    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("single-sync-push")],
    });
  });
});
