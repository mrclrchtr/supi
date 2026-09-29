import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
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

const temporaryDirectories: string[] = [];
const preparedRange = {
  start: { line: 0, character: 6 },
  end: { line: 0, character: 12 },
};

function addTemporaryFiles(...files: Array<{ tmpDir: string }>): void {
  temporaryDirectories.push(...files.map((file) => file.tmpDir));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LSP refactor transaction enrollment retry", () => {
  it("retries the complete prepared rename after a concurrent didOpen", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    addTemporaryFiles(target, enrolled);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const firstPrepared = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstPrepared.promise)
      .mockResolvedValueOnce(preparedRange)
      .mockResolvedValueOnce({ changes: {} });

    const request = client.renameDetailed(target.filePath, { line: 0, character: 6 }, "renamed");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstPrepared.resolve(preparedRange);

    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(3));
    await expect(request).resolves.toEqual({ kind: "completed", data: { changes: {} } });
    expect(rpc.sendRequest.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/prepareRename",
      "textDocument/prepareRename",
      "textDocument/rename",
    ]);
  });

  it("does not retry when content changes between preparation and rename", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    addTemporaryFiles(target);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const prepared = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => prepared.promise);

    const request = client.renameDetailed(target.filePath, { line: 0, character: 6 }, "renamed");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didChange(target.filePath, "const target = false;\n");
    prepared.resolve(preparedRange);

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("does not retry a ContentModified query after content changes", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    addTemporaryFiles(target);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);

    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didChange(target.filePath, "const target = false;\n");
    response.reject(Object.assign(new Error("server content changed"), { code: -32801 }));

    await expect(request).resolves.toMatchObject({
      kind: "unavailable",
      reason: "LSP request textDocument/hover failed: server content changed",
    });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("preserves cancellation through the complete transaction without retrying", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    addTemporaryFiles(target);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const prepared = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => prepared.promise);
    const controller = new AbortController();
    const control = { signal: controller.signal, deadline: Date.now() + 60_000 };

    const request = client.renameDetailed(
      target.filePath,
      { line: 0, character: 6 },
      "renamed",
      control,
    );
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    controller.abort(new Error("refactor cancelled"));
    prepared.resolve(preparedRange);

    await expect(request).rejects.toThrow("refactor cancelled");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
    expect(rpc.sendRequest.mock.calls[0]?.[2]).toBe(control);
  });

  it("does not exceed one retry when enrollment repeats during the follow-up", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const firstEnrolled = createDiagnosticTestFile("first.ts", "const first = true;\n");
    const secondEnrolled = createDiagnosticTestFile("second.ts", "const second = true;\n");
    addTemporaryFiles(target, firstEnrolled, secondEnrolled);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
      capabilities: { renameProvider: { prepareProvider: true } },
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const firstPrepared = deferred<unknown>();
    const secondPrepared = deferred<unknown>();
    rpc.sendRequest
      .mockImplementationOnce(() => firstPrepared.promise)
      .mockImplementationOnce(() => secondPrepared.promise);

    const request = client.renameDetailed(target.filePath, { line: 0, character: 6 }, "renamed");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    client.didOpen(firstEnrolled.filePath, "const first = true;\n");
    firstPrepared.resolve(preparedRange);
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    client.didOpen(secondEnrolled.filePath, "const second = true;\n");
    secondPrepared.resolve(preparedRange);

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
  });

  it("retries a code-action request with all lazy resolutions after enrollment", async () => {
    const target = createDiagnosticTestFile("target.ts", "const target = true;\n");
    const enrolled = createDiagnosticTestFile("enrolled.ts", "const enrolled = true;\n");
    addTemporaryFiles(target, enrolled);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
      capabilities: {
        codeActionProvider: {
          codeActionKinds: ["source.organizeImports"],
          resolveProvider: true,
        },
      },
    });
    client.didOpen(target.filePath, "const target = true;\n");
    const firstResolved = deferred<unknown>();
    const action = {
      title: "Organize imports",
      kind: "source.organizeImports",
      data: { stable: true },
    };
    rpc.sendRequest
      .mockResolvedValueOnce([action])
      .mockImplementationOnce(() => firstResolved.promise)
      .mockResolvedValueOnce([action])
      .mockResolvedValueOnce({ edit: { changes: {} } });

    const request = client.codeActionsDetailed(
      target.filePath,
      { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      { diagnostics: [], only: ["source.organizeImports"] },
    );
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    client.didOpen(enrolled.filePath, "const enrolled = true;\n");
    firstResolved.resolve({ edit: { changes: {} } });

    await expect(request).resolves.toMatchObject({
      kind: "completed",
      data: [{ title: "Organize imports", kind: "source.organizeImports" }],
    });
    expect(rpc.sendRequest.mock.calls.map(([method]) => method)).toEqual([
      "textDocument/codeAction",
      "codeAction/resolve",
      "textDocument/codeAction",
      "codeAction/resolve",
    ]);
  });
});
