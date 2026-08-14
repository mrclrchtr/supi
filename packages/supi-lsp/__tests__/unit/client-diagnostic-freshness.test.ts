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

  it("does not send a duplicate change for unchanged open content", () => {
    const file = createTempTsFile("duplicate-open.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    rpc.sendNotification.mockClear();

    client.didOpen(file.filePath, "const x = 1;");

    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("reuses current diagnostic evidence when file content is unchanged", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("unchanged-sync.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client, rpc } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("current")]);
    rpc.sendNotification.mockClear();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
    expect(rpc.sendNotification).not.toHaveBeenCalled();
  });

  it("does not reuse cached evidence after a workspace change", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("invalidated-sync.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("cached")]);
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [makeDiagnostic("cached")],
    });
  });

  it("rejects a pull response started before workspace invalidation", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("late-pull.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    let resolvePull!: (report: unknown) => void;
    rpc.sendRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    resolvePull({ kind: "full", items: [makeDiagnostic("stale pull")] });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("rejects malformed push diagnostic payloads without changing the cache", () => {
    const file = createTempTsFile("malformed-push.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.handlePublishDiagnostics({ uri: 42, diagnostics: [] });
    client.handlePublishDiagnostics({ uri: "file://[bad", diagnostics: [] });
    client.handlePublishDiagnostics({
      uri: file.uri,
      diagnostics: [
        {
          message: "bad code link",
          range: { start: { line: 1, character: 0 }, end: { line: 0, character: 0 } },
          code: 1,
          codeDescription: { href: "not-a-uri" },
        },
      ],
    });
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [null] });

    expect(client.getDiagnostics(file.filePath)).toEqual([]);
  });

  it("blocks an unversioned push until current evidence crosses workspace invalidation", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("late-push.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    publish(client, file.uri, [makeDiagnostic("stale push")]);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("keeps unversioned push barriers local to each document", () => {
    const first = createTempTsFile("first-barrier.ts", "const first = 1;");
    const second = createTempTsFile("second-barrier.ts", "const second = 1;");
    tmpDir = first.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(first.filePath, "const first = 1;");
    client.didOpen(second.filePath, "const second = 1;");
    client.notifyWorkspaceFileChanges([
      { uri: first.uri, type: 2 },
      { uri: second.uri, type: 2 },
    ]);
    client.didChange(first.filePath, "const first = 2;");

    const firstVersion = client.getOpenDocumentVersion(first.filePath);
    if (firstVersion === null) throw new Error("Expected the first document version.");
    client.handlePublishDiagnostics({ uri: first.uri, version: firstVersion, diagnostics: [] });
    client.handlePublishDiagnostics({ uri: first.uri, diagnostics: [makeDiagnostic("first")] });
    client.handlePublishDiagnostics({ uri: second.uri, diagnostics: [makeDiagnostic("stale")] });

    expect(client.getDiagnostics(first.filePath)).toEqual([makeDiagnostic("first")]);
    expect(client.getDiagnostics(second.filePath)).toEqual([]);
  });

  it("blocks an unversioned push after a document synchronization", () => {
    const file = createTempTsFile("document-barrier.ts", "const value = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const value = 1;");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [makeDiagnostic("old")] });
    client.didChange(file.filePath, "const value = 2;");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [makeDiagnostic("stale")] });

    expect(client.getDiagnostics(file.filePath)).toEqual([makeDiagnostic("old")]);
  });

  it("accepts unversioned push again after a current versioned push crosses invalidation", async () => {
    const file = createTempTsFile("push-after-versioned.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    const version = client.getOpenDocumentVersion(file.filePath);
    if (version === null) throw new Error("Expected an open document version.");
    client.handlePublishDiagnostics({ uri: file.uri, version, diagnostics: [] });
    await expect(pending).resolves.toEqual({ kind: "completed", data: [] });

    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [makeDiagnostic("current")] });
    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
  });

  it("accepts unversioned push again after a current pull crosses invalidation", async () => {
    const file = createTempTsFile("push-after-pull.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [] });
    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [],
    });

    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [makeDiagnostic("current")] });
    await expect(client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;")).resolves.toEqual({
      kind: "completed",
      data: [makeDiagnostic("current")],
    });
  });

  it("marks an invalidated empty cache stale in workspace snapshots", () => {
    const file = createTempTsFile("stale-clean-snapshot.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, []);
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);

    expect(client.getDiagnosticSnapshot()).toMatchObject({
      entries: [],
      current: false,
      documents: [{ uri: file.uri, current: false }],
    });
  });

  it("marks an open tracked document without a cache entry unconfirmed", () => {
    const file = createTempTsFile("missing-cache.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");

    expect(client.getDiagnosticSnapshot()).toEqual({
      entries: [],
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
      current: false,
    });
  });

  it("marks cached diagnostics stale after a document content change", () => {
    const file = createTempTsFile("changed-snapshot.ts", "const x = 1;");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    publish(client, file.uri, [makeDiagnostic("old")]);
    client.didChange(file.filePath, "const x = 2;");

    expect(client.getDiagnosticSnapshot()).toMatchObject({ current: false });
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

  it("rejects with the abort reason when cancelled during the pull fallback", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("aborted-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    const controller = new AbortController();
    rpc.sendRequest.mockImplementation(() => {
      controller.abort(new Error("cancelled mid-pull"));
      return Promise.reject(controller.signal.reason);
    });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: controller.signal,
    });

    await expect(pending).rejects.toThrow("cancelled mid-pull");
  });

  it("does not apply pull evidence when the caller aborts mid-pull", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("aborted-pull-apply.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    const controller = new AbortController();
    let pullStarted = false;
    rpc.sendRequest.mockImplementation((_method, _params, options) => {
      pullStarted = true;
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal.reason));
      });
    });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(pullStarted).toBe(true);

    controller.abort(new Error("cancelled mid-pull"));

    await expect(pending).rejects.toThrow("cancelled mid-pull");
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
  });

  it("rejects with the abort reason when cancelled during the push wait", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("aborted-push-wait.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    const controller = new AbortController();

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled during push wait"));

    await expect(pending).rejects.toThrow("cancelled during push wait");
  });

  it("rejects with the abort reason when cancelled during the push wait after a failed pull", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("aborted-pull-fallback.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    const controller = new AbortController();
    rpc.sendRequest.mockRejectedValue(new Error("pull failed"));

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled during fallback push wait"));

    await expect(pending).rejects.toThrow("cancelled during fallback push wait");
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
    client.handlePublishDiagnostics({
      uri: file.uri,
      diagnostics: [makeDiagnostic("closed-unversioned")],
    });
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
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

  it("marks a failed disk resynchronization as failed evidence", async () => {
    const file = createTempTsFile("failed-resynchronization.ts");
    tmpDir = file.tmpDir;
    const directoryPath = file.tmpDir;
    const directoryUri = `file://${directoryPath}`;
    const { client } = createRunningTestClient();
    client.didOpen(directoryPath, "const x = 1;");
    publish(client, directoryUri, [makeDiagnostic("cached")]);

    await expect(
      client.refreshOpenDiagnostics({ maxWaitMs: 10, quietMs: 1 }),
    ).resolves.toMatchObject({
      requested: 1,
      confirmed: 0,
      unconfirmed: 0,
      failed: 1,
      removed: 0,
      documents: [{ file: directoryPath, status: "failed" }],
    });
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: directoryUri, current: false, status: "failed" }],
    });
  });

  it("rejects a versioned publication after a document closes", () => {
    const file = createTempTsFile("closed-versioned.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    const version = client.getOpenDocumentVersion(file.filePath);
    if (version === null) throw new Error("Expected an open document version.");
    client.didClose(file.filePath);
    client.handlePublishDiagnostics({
      uri: file.uri,
      version,
      diagnostics: [makeDiagnostic("stale")],
    });

    expect(client.getDiagnostics(file.filePath)).toEqual([]);
  });

  it("carries an invalidation barrier across a close and reopen", () => {
    const file = createTempTsFile("closed-invalidation.ts");
    tmpDir = file.tmpDir;
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const x = 1;");
    client.didClose(file.filePath);
    client.notifyWorkspaceFileChanges([{ uri: file.uri, type: 2 }]);
    client.didOpen(file.filePath, "const x = 2;");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [makeDiagnostic("stale")] });

    expect(client.getDiagnostics(file.filePath)).toEqual([]);
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

  it("rejects a pull report containing malformed diagnostics", async () => {
    vi.useFakeTimers();
    const file = createTempTsFile("malformed-pull.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({ kind: "full", items: [null] });

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
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

  it("rejects a pull that finishes after a failed disk resynchronization", async () => {
    const file = createTempTsFile("inflight-resynchronization.ts");
    tmpDir = file.tmpDir;
    const { client, rpc } = createPullTestClient();
    let resolvePull!: (report: unknown) => void;
    rpc.sendRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    fs.rmSync(file.filePath);
    fs.mkdirSync(file.filePath);
    const refresh = client.refreshOpenDiagnostics({ maxWaitMs: 10, quietMs: 1 });
    resolvePull({ kind: "full", items: [] });

    await expect(refresh).resolves.toMatchObject({ failed: 1 });
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
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
