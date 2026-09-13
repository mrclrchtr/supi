import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTypeScriptTestClient, type TestRpc } from "../helpers/client-test-harness.ts";

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

type PendingPhase = ReturnType<typeof deferred<unknown>> & {
  settled: ReturnType<typeof deferred<void>>;
};

type RefreshTransportState = {
  starts: Array<{ uri: string; command: string; options: unknown }>;
  active: number;
  maximumActive: number;
  timedOutPhase: PendingPhase | undefined;
};

type TypeScriptCommand = {
  arguments?: unknown[];
};

function commandDetails(params: unknown): { uri: string; command: string } {
  const command = params as TypeScriptCommand;
  const commandName = command.arguments?.[0];
  const request = command.arguments?.[1];
  const uri =
    typeof request === "object" && request !== null && "file" in request
      ? String(request.file)
      : "";
  return { uri, command: String(commandName) };
}

function installRefreshTransport(
  rpc: Pick<TestRpc, "sendRequestOwned">,
  failedUris: ReadonlySet<string>,
  timedOutUri: string,
): RefreshTransportState {
  const state: RefreshTransportState = {
    starts: [],
    active: 0,
    maximumActive: 0,
    timedOutPhase: undefined,
  };
  rpc.sendRequestOwned.mockImplementation((_method: string, params: unknown, options: unknown) => {
    const details = commandDetails(params);
    state.starts.push({ ...details, options });
    state.active++;
    state.maximumActive = Math.max(state.maximumActive, state.active);
    if (details.uri === timedOutUri && details.command === "syntacticDiagnosticsSync") {
      const phase = {
        ...deferred<unknown>(),
        settled: deferred<void>(),
      } satisfies PendingPhase;
      state.timedOutPhase = phase;
      const settled = phase.settled.promise.then(() => {
        state.active--;
      });
      return { result: phase.promise, settled };
    }
    if (failedUris.has(details.uri) && details.command === "semanticDiagnosticsSync") {
      const result = Promise.reject(new Error("synthetic phase failure"));
      result.catch(() => {});
      return {
        result,
        settled: Promise.resolve().then(() => {
          state.active--;
        }),
      };
    }
    const result = Promise.resolve({ type: "response", success: true, body: [] });
    return {
      result,
      settled: result.then(() => {
        state.active--;
      }),
    };
  });
  return state;
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index++) await Promise.resolve();
}

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("large TypeScript diagnostic refresh", () => {
  it("uses one bounded route and exact coverage at the refresh deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const directory = mkdtempSync(join(tmpdir(), "supi-lsp-1000-documents-"));
    tempDirs.push(directory);
    const files = Array.from({ length: 1_000 }, (_, index) => {
      const filePath = join(directory, `document-${String(index).padStart(4, "0")}.ts`);
      writeFileSync(filePath, "export const value = 1;\n");
      return { filePath, uri: `file://${filePath}` };
    });
    const removedFiles = files.slice(-10);
    for (const file of removedFiles) unlinkSync(file.filePath);
    const failedUris = new Set(files.slice(700, 720).map((file) => file.uri));
    const timedOutUri = files[720]?.uri;
    if (!timedOutUri) throw new Error("Expected a timed-out document.");

    const { client, rpc } = createTypeScriptTestClient({
      root: files[0]?.filePath,
      cwd: directory,
    });
    for (const file of files) client.didOpen(file.filePath, "export const value = 1;\n");
    rpc.sendNotification.mockClear();
    const state = installRefreshTransport(rpc, failedUris, timedOutUri);

    const refresh = client.refreshOpenDiagnostics({ maxWaitMs: 100, quietMs: 1 });
    await vi.waitFor(() => expect(state.timedOutPhase).toBeDefined(), { timeout: 1_000 });
    await vi.advanceTimersByTimeAsync(100);
    const evidence = await refresh;

    expect(evidence).toMatchObject({
      requested: 1_000,
      confirmed: 700,
      unconfirmed: 270,
      failed: 20,
      removed: 10,
    });
    expect(evidence.documents.filter((document) => document.status === "confirmed")).toHaveLength(
      700,
    );
    expect(evidence.documents.filter((document) => document.status === "unconfirmed")).toHaveLength(
      270,
    );
    expect(evidence.documents.filter((document) => document.status === "failed")).toHaveLength(20);
    expect(evidence.documents.filter((document) => document.status === "removed")).toHaveLength(10);
    expect(state.maximumActive).toBe(1);
    expect(state.active).toBe(1);
    expect(state.starts).toHaveLength(2_141);
    expect(
      state.starts.every(({ options }) => {
        if (typeof options !== "object" || options === null || !("deadline" in options)) {
          return true;
        }
        return typeof options.deadline === "number" && options.deadline > 100;
      }),
    ).toBe(true);

    const calls = rpc.sendNotification.mock.calls;
    expect(calls.filter(([method]) => method === "textDocument/didChange")).toHaveLength(0);
    expect(calls.filter(([method]) => method === "textDocument/didOpen")).toHaveLength(0);
    expect(calls.filter(([method]) => method === "textDocument/didClose")).toHaveLength(10);

    const startedBeforeSettlement = state.starts.length;
    state.timedOutPhase?.reject(new Error("owner hard timeout"));
    state.timedOutPhase?.settled.resolve();
    await flushMicrotasks();
    expect(state.active).toBe(0);
    expect(state.starts).toHaveLength(startedBeforeSettlement);
  });
});
