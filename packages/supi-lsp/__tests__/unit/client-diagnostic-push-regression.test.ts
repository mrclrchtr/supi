import { readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "../../src/config/types.ts";
import {
  createDiagnosticTestFile,
  createPullTestClient,
  createRunningTestClient,
} from "../helpers/client-test-harness.ts";

const fsPromisesMock = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: fsPromisesMock.readFile };
});

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

function diagnostic(message: string): Diagnostic {
  return {
    message,
    severity: 1,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  };
}

async function settleInputRead(): Promise<void> {
  await vi.runAllTicks();
}

const tempDirs: string[] = [];

beforeEach(() => {
  fsPromisesMock.readFile.mockImplementation((filePath: string) =>
    Promise.resolve(readFileSync(filePath, "utf-8")),
  );
});

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("push diagnostic regression cases", () => {
  it("does not confirm a syntax push before a later semantic error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const file = createDiagnosticTestFile("phase-order.ts");
    tempDirs.push(file.tmpDir);
    const { client } = createRunningTestClient();
    client.didOpen(file.filePath, "const value = 1;\n");
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [diagnostic("old error")] });
    client.didClose(file.filePath);
    client.didOpen(file.filePath, "const value = 1;\n");

    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");
    await settleInputRead();
    await vi.advanceTimersByTimeAsync(0);
    setTimeout(() => client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] }), 10);
    setTimeout(
      () =>
        client.handlePublishDiagnostics({
          uri: file.uri,
          diagnostics: [diagnostic("late semantic error")],
        }),
      2_800,
    );
    await vi.advanceTimersByTimeAsync(3_100);
    await settleInputRead();
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [diagnostic("late semantic error")],
    });
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: false,
      documents: [{ uri: file.uri, current: false, status: "unconfirmed" }],
    });
  });

  it("uses push observation when the TypeScript command is not advertised", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("unsupported-command.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createRunningTestClient({
      name: "typescript-language-server",
      command: "typescript-language-server",
      capabilities: { executeCommandProvider: { commands: ["other.command"] } },
    });
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");
    await settleInputRead();
    await vi.advanceTimersByTimeAsync(0);
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [diagnostic("push error")] });
    await vi.advanceTimersByTimeAsync(3_100);
    await settleInputRead();
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [diagnostic("push error")],
    });
    expect(client.getDiagnostics(file.filePath)).toEqual([diagnostic("push error")]);
    expect(rpc.sendRequest).not.toHaveBeenCalled();
  });

  it("keeps one combined clean/error push observational", async () => {
    vi.useFakeTimers();
    const file = createDiagnosticTestFile("combined-push.ts");
    tempDirs.push(file.tmpDir);
    const { client } = createRunningTestClient();
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");
    await settleInputRead();
    await vi.advanceTimersByTimeAsync(0);
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [diagnostic("type error")] });
    await vi.advanceTimersByTimeAsync(3_100);
    await settleInputRead();
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      kind: "partial",
      data: [diagnostic("type error")],
    });
    expect(client.getDiagnostics(file.filePath)).toEqual([diagnostic("type error")]);
    expect(client.getDiagnosticSnapshot()).toMatchObject({ current: false });
  });

  it("keeps confirmed request errors when an ambient clean push arrives", async () => {
    const file = createDiagnosticTestFile("request-error.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createPullTestClient();
    rpc.sendRequest.mockResolvedValue({
      kind: "full",
      items: [diagnostic("confirmed error")],
    });

    await expect(
      client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n"),
    ).resolves.toEqual({
      kind: "completed",
      data: [diagnostic("confirmed error")],
    });
    client.handlePublishDiagnostics({ uri: file.uri, diagnostics: [] });

    expect(client.getDiagnostics(file.filePath)).toEqual([diagnostic("confirmed error")]);
    expect(client.getDiagnosticSnapshot()).toMatchObject({
      current: true,
      documents: [{ uri: file.uri, current: true, status: "confirmed" }],
    });
  });

  it("cancels direct sync-file collection before resynchronization", async () => {
    const file = createDiagnosticTestFile("direct-resync.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createPullTestClient();
    const oldResult = deferred<unknown>();
    const oldSettled = deferred<void>();
    const currentResult = deferred<unknown>();
    const currentSettled = deferred<void>();
    rpc.sendRequestOwned
      .mockReturnValueOnce({ result: oldResult.promise, settled: oldSettled.promise })
      .mockReturnValueOnce({ result: currentResult.promise, settled: currentSettled.promise });

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");
    await vi.waitFor(() => expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(1));
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const value = 2;\n");

    expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(1);
    expect(rpc.sendNotification).toHaveBeenCalledWith(
      "textDocument/didChange",
      expect.objectContaining({ textDocument: expect.objectContaining({ uri: file.uri }) }),
    );

    oldResult.resolve({ kind: "full", items: [diagnostic("stale")] });
    oldSettled.resolve();
    await expect(first).resolves.toMatchObject({ kind: "unavailable" });
    await vi.waitFor(() => expect(rpc.sendRequestOwned).toHaveBeenCalledTimes(2));
    currentResult.resolve({ kind: "full", items: [diagnostic("current")] });
    currentSettled.resolve();

    await expect(second).resolves.toEqual({
      kind: "completed",
      data: [diagnostic("current")],
    });
  });

  it("does not let a stale push erase current evidence after resynchronization", async () => {
    const file = createDiagnosticTestFile("stale-after-resync.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createPullTestClient();
    let resolveOld!: (value: unknown) => void;
    let resolveCurrent!: (value: unknown) => void;
    rpc.sendRequest
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCurrent = resolve;
          }),
      );

    const first = client.syncAndWaitForDiagnostics(file.filePath, "const value = 1;\n");
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));
    const oldVersion = client.getOpenDocumentVersion(file.filePath);
    if (oldVersion === null) throw new Error("Expected the old document version.");
    client.didChange(file.filePath, "const value = 2;\n");
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const value = 2;\n");

    resolveOld({ kind: "full", items: [diagnostic("stale response")] });
    await expect(first).resolves.toMatchObject({ kind: "unavailable" });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));
    client.handlePublishDiagnostics({
      uri: file.uri,
      version: oldVersion,
      diagnostics: [diagnostic("stale push")],
    });
    resolveCurrent({ kind: "full", items: [diagnostic("current error")] });

    await expect(second).resolves.toEqual({
      kind: "completed",
      data: [diagnostic("current error")],
    });
    client.handlePublishDiagnostics({
      uri: file.uri,
      version: oldVersion,
      diagnostics: [diagnostic("late stale push")],
    });
    expect(client.getDiagnostics(file.filePath)).toEqual([diagnostic("current error")]);
  });
});
