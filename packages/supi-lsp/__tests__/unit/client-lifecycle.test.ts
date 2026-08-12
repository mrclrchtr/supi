import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";

type TestClient = {
  _status: "initializing" | "running" | "error" | "shutdown";
  armNoProgressTimer(): void;
  didOpen(filePath: string, content: string): void;
  handleProcessFailure(reason: Error): void;
  handleProgress(params: { token: string; value: { kind: string } }): void;
  handleServerRequest(method: string, params: unknown): unknown;
  readonly openFiles: string[];
  readonly ready: boolean;
  rpc: {
    dispose(): void;
    onNotification(): void;
    onRequest(): void;
    sendNotification(): Promise<void>;
    sendRequest(): Promise<unknown>;
  };
  readonly status: "initializing" | "running" | "error" | "shutdown";
};

function createRunningClient(transitions: string[]): LspClient {
  const client = new LspClient(
    "test",
    {
      command: "echo",
      fileTypes: ["ts"],
      rootMarkers: ["tsconfig.json"],
    },
    "/project",
    (kind) => transitions.push(kind),
  );
  const testClient = client as unknown as TestClient;
  testClient._status = "running";
  testClient.rpc = {
    dispose: vi.fn(),
    onNotification: vi.fn(),
    onRequest: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    sendRequest: vi.fn().mockResolvedValue({}),
  };
  testClient.armNoProgressTimer();
  return client;
}

describe("LspClient lifecycle publication", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes readiness when the concrete client becomes ready", async () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.ready).toBe(true);
    expect(transitions).toEqual(["readiness"]);
  });

  it("publishes late readiness loss and recovery", async () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions) as unknown as TestClient;
    await vi.advanceTimersByTimeAsync(2_000);

    client.handleServerRequest("window/workDoneProgress/create", { token: "late" });

    expect(client.ready).toBe(false);
    expect(transitions).toEqual(["readiness", "readiness"]);

    client.handleProgress({ token: "late", value: { kind: "end" } });

    expect(client.ready).toBe(true);
    expect(transitions).toEqual(["readiness", "readiness", "readiness"]);
  });

  it("publishes tracked-file changes only when the tracked set changes", () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions);

    client.didOpen("/project/src/a.ts", "const a = 1;");
    client.didChange("/project/src/a.ts", "const a = 2;");
    client.didClose("/project/src/a.ts");

    expect(transitions).toEqual(["tracked-files", "tracked-files"]);
  });

  it("publishes a crash after it clears concrete readiness and tracked files", () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions) as unknown as TestClient;
    client.didOpen("/project/src/a.ts", "const a = 1;");

    client.handleProcessFailure(new Error("server failed"));

    expect(client.status).toBe("error");
    expect(client.ready).toBe(false);
    expect(client.openFiles).toEqual([]);
    expect(transitions).toEqual(["tracked-files", "crash"]);
  });

  it("publishes shutdown after it clears concrete readiness and tracked files", async () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions);
    client.didOpen("/project/src/a.ts", "const a = 1;");

    await client.shutdown();

    expect(client.status).toBe("shutdown");
    expect(client.ready).toBe(false);
    expect(client.openFiles).toEqual([]);
    expect(transitions).toEqual(["tracked-files", "shutdown"]);
  });
});
