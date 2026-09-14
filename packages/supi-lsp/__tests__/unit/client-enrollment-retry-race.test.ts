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
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP enrollment retry races", () => {
  it("does not retry when a real edit follows enrollment classification", async () => {
    const target = createDiagnosticTestFile("queued-target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("queued-enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    client.didOpen(target.filePath, "const target = true;\n");

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });
    queueMicrotask(() => client.didChange(target.filePath, "const target = false;\n"));

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not retry when a real edit occurs during retry readiness", async () => {
    const target = createDiagnosticTestFile("ready-target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("ready-enrolled.ts", "const enrolled = true;\n");
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    const retryReady = deferred<void>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    const getReady = vi.spyOn(client, "getReady");
    getReady
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => {
        queueMicrotask(() => client.didChange(target.filePath, "const target = false;\n"));
        return retryReady.promise;
      });
    client.didOpen(target.filePath, "const target = true;\n");

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    response.resolve({ contents: { kind: "plaintext", value: "stale" } });
    await vi.waitFor(() => expect(getReady).toHaveBeenCalledTimes(2));
    retryReady.resolve();

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not retry diagnostics or restore old authoritative content after a queued edit", async () => {
    const target = createDiagnosticTestFile("queued-diagnostic.ts", "const disk = true;\n");
    const enrolled = createDiagnosticTestFile(
      "queued-diagnostic-enrolled.ts",
      "const enrolled = true;\n",
    );
    temporaryDirectories.push(target.tmpDir, enrolled.tmpDir);
    const { client, rpc } = createPullTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const requestedContent = "const requested = true;\n";
    const changedContent = "const changed = true;\n";
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.syncAndWaitForDiagnostics(target.filePath, requestedContent, undefined, {
      contentIsAuthoritative: true,
    });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    response.resolve(fullReport("stale"));
    queueMicrotask(() => client.didChange(target.filePath, changedContent));

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
    const changes = rpc.sendNotification.mock.calls.filter(
      ([method]) => method === "textDocument/didChange",
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[1]).toEqual(
      expect.objectContaining({ contentChanges: [{ text: changedContent }] }),
    );
    expect(rpc.sendNotification).not.toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.objectContaining({ contentChanges: [{ text: requestedContent }] }),
    );
  });
});
