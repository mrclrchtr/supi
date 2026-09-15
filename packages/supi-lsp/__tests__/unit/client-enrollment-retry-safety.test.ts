import { rmSync } from "node:fs";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticTestFile,
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

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function startRetryingHover(control?: CodeRequestControl) {
  const target = createDiagnosticTestFile("retry-target.ts", "const target = true;\n");
  const enrolled = createDiagnosticTestFile("retry-enrolled.ts", "const enrolled = true;\n");
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
  client.didOpen(target.filePath, "const target = true;\n");

  const request = client.hover(target.filePath, { line: 0, character: 6 }, control);
  await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

  client.didOpen(enrolled.filePath, "const enrolled = true;\n");
  firstResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });
  await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(2));

  return { client, rpc, request, secondResponse, target };
}

describe("LSP enrollment retry safety", () => {
  it("returns unavailable without retry when shutdown invalidates a running request", async () => {
    const target = createDiagnosticTestFile("lifecycle-target.ts", "const target = true;\n");
    temporaryDirectories.push(target.tmpDir);
    const { client, rpc } = createRunningTestClient({
      root: target.tmpDir,
      cwd: target.tmpDir,
    });
    const response = deferred<unknown>();
    rpc.sendRequest.mockImplementationOnce(() => response.promise);
    const request = client.hover(target.filePath, { line: 0, character: 6 });
    await vi.waitFor(() => expect(rpc.sendRequest).toHaveBeenCalledTimes(1));

    await client.shutdown();
    response.resolve({ contents: { kind: "plaintext", value: "late" } });

    await expect(request).resolves.toMatchObject({ kind: "unavailable" });
    expect(rpc.sendRequest).toHaveBeenCalledTimes(1);
  });

  it("enforces the absolute deadline during the second attempt", async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    const control = { deadline: baseTime + 60_000 };
    const { rpc, request, secondResponse } = await startRetryingHover(control);

    vi.setSystemTime(control.deadline);
    secondResponse.resolve({ contents: { kind: "plaintext", value: "late" } });

    await expect(request).rejects.toThrow("Code request deadline exceeded");
    expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
    expect(rpc.sendRequest.mock.calls[1]?.[2]).toBe(control);
  });

  it.each(["content", "workspace", "close"] as const)(
    "does not accept %s invalidation after the first enrollment retry",
    async (changeKind) => {
      const { client, rpc, request, secondResponse, target } = await startRetryingHover();

      switch (changeKind) {
        case "content":
          client.didChange(target.filePath, "const target = false;\n");
          break;
        case "workspace":
          client.notifyWorkspaceFileChanges([{ uri: target.uri, type: 2 }]);
          break;
        case "close":
          client.didClose(target.filePath);
          break;
      }
      secondResponse.resolve({ contents: { kind: "plaintext", value: "stale" } });

      await expect(request).resolves.toMatchObject({ kind: "unavailable" });
      expect(rpc.sendRequest).toHaveBeenCalledTimes(2);
    },
  );
});
