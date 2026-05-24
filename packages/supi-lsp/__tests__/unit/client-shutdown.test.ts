import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for focused shutdown tests
type AnyClient = any;

function createRunningClient(): LspClient {
  const client = new LspClient(
    "test",
    { command: "echo", args: [], fileTypes: ["ts"], rootMarkers: ["tsconfig.json"] },
    "/project",
  );
  (client as AnyClient)._status = "running";
  return client;
}

function createExitedProcess(): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as AnyClient).exitCode = 0;
  return proc;
}

describe("LspClient shutdown", () => {
  it("waits for the final exit notification before disposing the RPC transport", async () => {
    const client = createRunningClient();
    const calls: string[] = [];
    let resolveExit!: () => void;
    const exitSent = new Promise<void>((resolve) => {
      resolveExit = () => {
        calls.push("notification:exit:done");
        resolve();
      };
    });

    (client as AnyClient).rpc = {
      sendRequest: vi.fn(async (method: string) => {
        calls.push(`request:${method}`);
        return null;
      }),
      sendNotification: vi.fn((method: string) => {
        calls.push(`notification:${method}:start`);
        return exitSent;
      }),
      dispose: vi.fn(() => {
        calls.push("dispose");
      }),
    };
    (client as AnyClient).process = createExitedProcess();

    const shutdownPromise = client.shutdown();
    await vi.waitFor(() => {
      expect(calls).toEqual(["request:shutdown", "notification:exit:start"]);
    });

    resolveExit();
    await shutdownPromise;

    expect(calls).toEqual([
      "request:shutdown",
      "notification:exit:start",
      "notification:exit:done",
      "dispose",
    ]);
    expect(client.status).toBe("shutdown");
  });
});
