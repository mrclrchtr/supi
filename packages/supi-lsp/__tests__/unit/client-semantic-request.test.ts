import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
  createPullTestClient,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function fullReport(message: string): {
  kind: "full";
  items: [{ message: string; range: object }];
} {
  return {
    kind: "full",
    items: [
      {
        message,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      },
    ],
  };
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LspClient concurrent semantic requests", () => {
  it("requeries after a document is enrolled while the request is running", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce({ contents: { kind: "plaintext", value: "fresh" } });

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });

    await expect(request).resolves.toEqual({
      kind: "completed",
      data: { contents: { kind: "plaintext", value: "fresh" } },
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("does not retry after a second enrollment invalidates the follow-up", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const firstEnrolled = createDiagnosticTestFile("first-enrolled.ts", "const first = true;\n");
    const secondEnrolled = createDiagnosticTestFile("second-enrolled.ts", "const second = true;\n");
    temporaryDirectories.push(target.tmpDir, firstEnrolled.tmpDir, secondEnrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResponse = deferred<unknown>();
    const secondResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(firstEnrolled.filePath, "const first = true;\n");
    firstResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));

    client.didOpen(secondEnrolled.filePath, "const second = true;\n");
    secondResponse.resolve({ contents: { kind: "plaintext", value: "stale again" } });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects a response after document content changes without requerying", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didOpen(target.filePath, "const target = true;\n");
    client.didChange(target.filePath, "const target = false;\n");
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason:
        "LSP request textDocument/hover failed: Semantic input changed while the request was running.",
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects a response after a workspace change without requerying", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.notifyWorkspaceFileChanges([{ uri: target.uri, type: 2 }]);
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects a response after a document closes without requerying", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didClose(target.filePath);
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("preserves cancellation and the original control during the follow-up", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResponse = deferred<unknown>();
    const secondResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    const controller = new AbortController();
    const control = { signal: controller.signal, deadline: Date.now() + 60_000 };

    const request = client.hover(target.filePath, { line: 0, character: 6 }, control);
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));

    expect(rpc.sendRequest.mock.calls[0]?.[2]).toBe(control);
    expect(rpc.sendRequest.mock.calls[1]?.[2]).toBe(control);
    controller.abort(new Error("semantic request cancelled"));
    secondResponse.resolve({ contents: { kind: "plaintext", value: "late" } });

    await expect(request).rejects.toThrow("semantic request cancelled");
  });

  it("preserves deadline failure after enrollment without accepting the stale response", async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    const control = { deadline: baseTime + 60_000 };

    const request = client.hover(target.filePath, { line: 0, character: 6 }, control);
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });
    vi.setSystemTime(baseTime + 60_000);

    await expect(request).rejects.toThrow("Code request deadline exceeded");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("re-synchronizes diagnostics after a document is enrolled during the request", async () => {
    const target = createDiagnosticTestFile("diagnostic-target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("diagnostic-enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(fullReport("fresh"));

    const request = client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResponse.resolve(fullReport("stale"));

    await expect(request).resolves.toEqual({
      kind: "completed",
      data: [fullReport("fresh").items[0]],
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("retains authoritative content through an enrollment retry", async () => {
    const target = createDiagnosticTestFile("diagnostic-override.ts", "const disk = true;\n");
    const enrolled = createDiagnosticTestFile(
      "diagnostic-override-enrolled.ts",
      "const enrolled = true;\n",
    );
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const requestedContent = "const requested = true;\n";
    const firstResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(fullReport("fresh"));

    const request = client.syncAndWaitForDiagnostics(target.filePath, requestedContent, undefined, {
      contentIsAuthoritative: true,
    });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResponse.resolve(fullReport("stale"));

    await expect(request).resolves.toMatchObject({
      kind: "completed",
      data: [fullReport("fresh").items[0]],
    });
    expect(rpc.sendNotification).toHaveBeenCalledWith(
      "textDocument/didOpen",
      expect.objectContaining({
        textDocument: expect.objectContaining({ uri: target.uri, text: requestedContent }),
      }),
    );
    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.anything(),
    );
  });

  it("keeps the obsolete diagnostic transport owned until it settles", async () => {
    const target = createDiagnosticTestFile("diagnostic-owned-target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile(
      "diagnostic-owned-enrolled.ts",
      "const enrolled = true;\n",
    );
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResult = deferred<unknown>();
    const firstSettled = deferred<void>();
    const secondResult = deferred<unknown>();
    const secondSettled = deferred<void>();
    rpc.sendRequestOwned
      .mockImplementationOnce(() => ({
        result: firstResult.promise,
        settled: firstSettled.promise,
      }))
      .mockImplementationOnce(() => ({
        result: secondResult.promise,
        settled: secondSettled.promise,
      }));

    const request = client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n");
    await vi.waitFor(() => expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResult.resolve(fullReport("stale"));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(1);
    firstSettled.resolve();
    await vi.waitFor(() => expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(2));
    secondResult.resolve(fullReport("fresh"));
    secondSettled.resolve();

    await expect(request).resolves.toEqual({
      kind: "completed",
      data: [fullReport("fresh").items[0]],
    });
  });

  it("does not retry diagnostics after a second enrollment invalidates the follow-up", async () => {
    const target = createDiagnosticTestFile("diagnostic-target.ts", "const target = true;\n");
    const firstEnrolled = createDiagnosticTestFile("diagnostic-first.ts", "const first = true;\n");
    const secondEnrolled = createDiagnosticTestFile(
      "diagnostic-second.ts",
      "const second = true;\n",
    );
    temporaryDirectories.push(target.tmpDir, firstEnrolled.tmpDir, secondEnrolled.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const firstResponse = deferred<unknown>();
    const secondResponse = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);

    const request = client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(firstEnrolled.filePath, "const first = true;\n");
    firstResponse.resolve(fullReport("stale-first"));
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));

    client.didOpen(secondEnrolled.filePath, "const second = true;\n");
    secondResponse.resolve(fullReport("stale-second"));

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Diagnostic collection failed closed"),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
    expect(client.getDiagnosticSnapshot().current).toBe(false);
  });

  it("rejects diagnostic evidence after content changes without retrying", async () => {
    const target = createDiagnosticTestFile("diagnostic-content.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.syncAndWaitForDiagnostics(target.filePath, "const target = true;\n");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didChange(target.filePath, "const target = false;\n");
    response.resolve(fullReport("stale"));

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: expect.stringContaining("Diagnostic collection failed closed"),
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });
});
