import { rmSync, writeFileSync } from "node:fs";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
  createPullTestClient,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function contentModifiedError(): Error & { code: number } {
  return Object.assign(new Error("content modified"), { code: -32801 });
}

const temporaryDirectories: string[] = [];

function makeTarget(): { filePath: string; tmpDir: string } {
  const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
  temporaryDirectories.push(target.tmpDir);
  return target;
}

beforeEach(() => {
  resetDebugRegistry();
  configureDebugRegistry({ enabled: true, maxEvents: 100 });
});

afterEach(() => {
  vi.useRealTimers();
  resetDebugRegistry();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP ContentModified retry", () => {
  it("retries one read-only semantic request with the same parameters", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    rpc.sendRequest
      .mockRejectedValueOnce(contentModifiedError())
      .mockResolvedValueOnce({ contents: { kind: "plaintext", value: "fresh" } });

    const result = await client.hover(target.filePath, { line: 0, character: 6 });

    expect(result).toEqual({
      kind: "completed",
      data: { contents: { kind: "plaintext", value: "fresh" } },
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
    expect(rpc.sendRequest.mock.calls[1]).toEqual(rpc.sendRequest.mock.calls[0]);
    const retryEvents = getDebugEvents({ source: "lsp", category: "request.retry" }).events;
    expect(retryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "retry", retryReason: "content-modified" }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "completed", retryReason: "content-modified" }),
        }),
      ]),
    );
  });

  it("uses one shared retry when enrollment is followed by ContentModified", async () => {
    const target = makeTarget();
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    const firstResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockRejectedValueOnce(contentModifiedError());

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });

    const result = await request;
    expect(result).toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Request retry exhausted after 1 retry"),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("content modified");
      expect(result.reason).not.toContain("Enrollment retry");
    }
    const retryEvents = getDebugEvents({ source: "lsp", category: "request.retry" }).events;
    expect(retryEvents).toHaveLength(2);
    expect(retryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "retry", retryReason: "enrollment" }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: "exhausted",
            retryReason: "enrollment",
            failureReason: "content-modified",
          }),
        }),
      ]),
    );
  });

  it("stops before a retry when a document changes", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    writeFileSync(target.filePath, "const target = false;\n");
    response.reject(contentModifiedError());

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Semantic input changed while the request was running."),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("stops before a retry when the client shuts down", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    await client.shutdown();
    response.reject(contentModifiedError());

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not accept a retried result after a document changes", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    const retryResponse = deferred<unknown>();
    rpc.sendRequest
      .mockRejectedValueOnce(contentModifiedError())
      .mockImplementationOnce(() => retryResponse.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    client.didChange(target.filePath, "const target = false;\n");
    retryResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Semantic input changed while the request was running."),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("does not start a retry after caller cancellation", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    const controller = new AbortController();

    const request = client.hover(
      target.filePath,
      { line: 0, character: 6 },
      {
        signal: controller.signal,
      },
    );
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    controller.abort(new Error("semantic query cancelled"));
    response.reject(contentModifiedError());

    await expect(request).rejects.toThrow("semantic query cancelled");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not start a retry after the request deadline", async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    client.didOpen(target.filePath, "const target = true;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    const control = { deadline: baseTime + 60_000 };

    const request = client.hover(target.filePath, { line: 0, character: 6 }, control);
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    vi.setSystemTime(baseTime + 60_000);
    response.reject(contentModifiedError());

    await expect(request).rejects.toThrow("Code request deadline exceeded");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps other server errors unchanged", async () => {
    const target = makeTarget();
    const { client, rpc } = createRunningTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    rpc.sendRequest.mockRejectedValueOnce(
      Object.assign(new Error("content modified"), { code: -32603 }),
    );

    await expect(client.hover(target.filePath, { line: 0, character: 6 })).resolves.toEqual({
      kind: "unavailable",
      reason: "LSP request textDocument/hover failed: content modified",
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not add ContentModified retries to diagnostic requests", async () => {
    const target = makeTarget();
    const { client, rpc } = createPullTestClient({ root: target.tmpDir, cwd: target.tmpDir });
    rpc.sendRequest.mockRejectedValueOnce(contentModifiedError());

    await expect(
      client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n"),
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });
});
