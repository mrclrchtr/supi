import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
  createRunningTestClient,
  createTypeScriptTestClient,
  type TestRpc,
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

type OwnedPhase = {
  params: { arguments: [string] };
  result: ReturnType<typeof deferred<unknown>>;
  settled: ReturnType<typeof deferred<void>>;
};

type OwnedPhaseState = {
  phases: OwnedPhase[];
  starts: string[];
};

function installOwnedTypeScriptPhases(rpc: Pick<TestRpc, "sendRequestOwned">): OwnedPhaseState {
  const state: OwnedPhaseState = { phases: [], starts: [] };
  rpc.sendRequestOwned.mockImplementation((_method: string, params: { arguments: [string] }) => {
    const phase = {
      params,
      result: deferred<unknown>(),
      settled: deferred<void>(),
    } satisfies OwnedPhase;
    state.phases.push(phase);
    state.starts.push(params.arguments[0]);
    return { result: phase.result.promise, settled: phase.settled.promise };
  });
  return state;
}

function resolvePhase(phase: OwnedPhase, body: unknown[] = []): void {
  phase.result.resolve({ type: "response", success: true, body });
  phase.settled.resolve();
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LspClient diagnostic request ownership", () => {
  it("shares a native pull after the first caller aborts", async () => {
    const file = createDiagnosticTestFile("native-shared.ts");
    tempDirs.push(file.tmpDir);
    const { client: pullClient, rpc: nativeRpc } = createRunningTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
      capabilities: {
        diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
      },
    });
    const result = deferred<unknown>();
    const settled = deferred<void>();
    nativeRpc.sendRequestOwned.mockReturnValue({
      result: result.promise,
      settled: settled.promise,
    });
    const firstController = new AbortController();
    const first = pullClient.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: firstController.signal,
    });
    await vi.waitFor(() => expect(nativeRpc.sendRequestOwned).toHaveBeenCalledTimes(1));
    firstController.abort(new Error("native first caller left"));
    await expect(first).rejects.toThrow("native first caller left");

    const second = pullClient.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    result.resolve({ kind: "full", items: [] });
    settled.resolve();

    await expect(second).resolves.toEqual({ kind: "completed", data: [] });
    expect(nativeRpc.sendRequestOwned).toHaveBeenCalledTimes(1);
    expect(nativeRpc.sendRequestOwned).toHaveBeenCalledWith(
      "textDocument/diagnostic",
      expect.objectContaining({
        textDocument: { uri: file.uri },
        previousResultId: undefined,
      }),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("lets a live same-file caller join work after the first caller aborts", async () => {
    const file = createDiagnosticTestFile("shared.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const firstController = new AbortController();
    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: firstController.signal,
    });
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));

    firstController.abort(new Error("first caller left"));
    await expect(first).rejects.toThrow("first caller left");

    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    expect(state.phases).toHaveLength(1);
    resolvePhase(state.phases[0]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(2));
    resolvePhase(state.phases[1], [
      {
        message: "shared error",
        start: 0,
        length: 1,
        startLocation: { line: 1, offset: 1 },
        endLocation: { line: 1, offset: 2 },
        category: "error",
        code: 2322,
      },
    ]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(3));
    resolvePhase(state.phases[2]);

    await expect(second).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ message: "shared error", severity: 1 })],
    });
    expect(state.starts).toEqual([
      "syntacticDiagnosticsSync",
      "semanticDiagnosticsSync",
      "suggestionDiagnosticsSync",
    ]);
  });

  it("keeps shared work alive across mixed caller deadlines", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const file = createDiagnosticTestFile("mixed-deadlines.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      deadline: 10,
    });
    const firstRejected = expect(first).rejects.toThrow("Code request deadline exceeded");
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      deadline: Date.now() + 10_000,
    });

    await vi.advanceTimersByTimeAsync(10);
    await firstRejected;
    expect(state.phases).toHaveLength(1);

    resolvePhase(state.phases[0]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(2));
    resolvePhase(state.phases[1]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(3));
    resolvePhase(state.phases[2]);

    await expect(second).resolves.toEqual({ kind: "completed", data: [] });
    expect(state.phases).toHaveLength(3);
  });

  it("does not start another file until the shared collection really settles", async () => {
    const firstFile = createDiagnosticTestFile("first.ts");
    const secondFile = createDiagnosticTestFile("second.ts");
    tempDirs.push(firstFile.tmpDir, secondFile.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: firstFile.filePath,
      cwd: firstFile.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const firstController = new AbortController();
    const first = client.syncAndWaitForDiagnostics(firstFile.filePath, "const x = 1;", {
      signal: firstController.signal,
    });
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));
    firstController.abort(new Error("first caller left"));
    await expect(first).rejects.toThrow("first caller left");

    const second = client.syncAndWaitForDiagnostics(secondFile.filePath, "const x = 1;");
    state.phases[0]?.result.resolve({ type: "response", success: true, body: [] });
    await Promise.resolve();
    expect(state.phases).toHaveLength(1);
    state.phases[0]?.settled.resolve();
    await vi.waitFor(() => expect(state.phases).toHaveLength(2));

    resolvePhase(state.phases[1]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(3));
    resolvePhase(state.phases[2]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(4));
    resolvePhase(state.phases[3]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(5));
    resolvePhase(state.phases[4]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(6));
    resolvePhase(state.phases[5]);

    await expect(second).resolves.toMatchObject({ kind: "completed", data: [] });
    expect(state.starts).toEqual([
      "syntacticDiagnosticsSync",
      "semanticDiagnosticsSync",
      "suggestionDiagnosticsSync",
      "syntacticDiagnosticsSync",
      "semanticDiagnosticsSync",
      "suggestionDiagnosticsSync",
    ]);
  });

  it("does not duplicate work when all callers leave before the owner settles", async () => {
    const file = createDiagnosticTestFile("all-gone.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: firstController.signal,
    });
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));
    const second = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;", {
      signal: secondController.signal,
    });
    firstController.abort(new Error("first caller left"));
    secondController.abort(new Error("second caller left"));
    await expect(first).rejects.toThrow("first caller left");
    await expect(second).rejects.toThrow("second caller left");

    resolvePhase(state.phases[0]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(2));
    resolvePhase(state.phases[1]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(3));
    resolvePhase(state.phases[2]);
    await Promise.resolve();

    expect(state.phases).toHaveLength(3);
    expect(state.starts).toHaveLength(3);
  });

  it("rejects an adapter response after document invalidation", async () => {
    const file = createDiagnosticTestFile("invalidated.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));

    client.didChange(file.filePath, "const x = 2;");
    state.phases[0]?.result.resolve({
      type: "response",
      success: true,
      body: [
        {
          message: "stale error",
          start: 0,
          length: 1,
          startLocation: { line: 1, offset: 1 },
          endLocation: { line: 1, offset: 2 },
          category: "error",
          code: 2322,
        },
      ],
    });
    state.phases[0]?.settled.resolve();
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    expect(client.getDiagnostics(file.filePath)).toEqual([]);

    const current = client.syncAndWaitForDiagnostics(file.filePath, "const x = 2;");
    await vi.waitFor(() => expect(state.phases).toHaveLength(2));
    resolvePhase(state.phases[1]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(3));
    resolvePhase(state.phases[2]);
    await vi.waitFor(() => expect(state.phases).toHaveLength(4));
    resolvePhase(state.phases[3]);
    await expect(current).resolves.toEqual({ kind: "completed", data: [] });
  });

  it("releases an invalidated request on client shutdown", async () => {
    const file = createDiagnosticTestFile("shutdown.ts");
    tempDirs.push(file.tmpDir);
    const { client, rpc } = createTypeScriptTestClient({
      root: file.filePath,
      cwd: file.tmpDir,
    });
    const state = installOwnedTypeScriptPhases(rpc);
    const pending = client.syncAndWaitForDiagnostics(file.filePath, "const x = 1;");
    await vi.waitFor(() => expect(state.phases).toHaveLength(1));

    await client.shutdown();
    await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    resolvePhase(state.phases[0]);
    await Promise.resolve();
    expect(client.getDiagnostics(file.filePath)).toEqual([]);
  });
});
