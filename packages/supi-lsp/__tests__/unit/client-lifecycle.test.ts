import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LspClient } from "../../src/client/client.ts";

type TestClient = {
  _status: "initializing" | "running" | "error" | "shutdown";
  _isReady: boolean;
  everReady: boolean;
  startedAt: number;
  tokenCreatedAt: Map<string, number>;
  getRecoveryStallSignal(): "readiness-stall" | "protocol-errors" | null;
  armNoProgressTimer(): void;
  didOpen(filePath: string, content: string): void;
  handleProcessFailure(reason: Error): void;
  handleProgress(params: { token: string; value: { kind: string } }): void;
  handleServerRequest(method: string, params: unknown): unknown;
  readonly openFiles: string[];
  readonly ready: boolean;
  rpc: {
    dispose(): void;
    getProtocolFailureCount(): number;
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
  testClient.startedAt = Date.now();
  testClient.rpc = {
    dispose: vi.fn(),
    getProtocolFailureCount: vi.fn(() => 0),
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

  it("publishes readiness loss only on begin and recovery on end", async () => {
    const transitions: string[] = [];
    const client = createRunningClient(transitions) as unknown as TestClient;
    await vi.advanceTimersByTimeAsync(2_000);

    client.handleServerRequest("window/workDoneProgress/create", { token: "late" });

    // A pending token never blocks a ready client (issue #319).
    expect(client.ready).toBe(true);
    expect(transitions).toEqual(["readiness"]);

    client.handleProgress({ token: "late", value: { kind: "begin" } });
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

  it("reports a readiness-stall signal when a running client never became ready", async () => {
    const client = createRunningClient([]) as unknown as TestClient;
    client._isReady = false;
    client.startedAt = Date.now() - 6_000;

    expect(client.getRecoveryStallSignal()).toBe("readiness-stall");
  });

  it("does not report a readiness-stall after the client was ready once", async () => {
    const client = createRunningClient([]) as unknown as TestClient;
    // The client became ready early, then lost readiness for normal indexing.
    client.everReady = true;
    client._isReady = false;
    client.startedAt = Date.now() - 6_000;

    expect(client.getRecoveryStallSignal()).toBeNull();
  });

  it("reports a readiness-stall signal for a created token that never began", async () => {
    vi.useFakeTimers();
    const client = createRunningClient([]) as unknown as TestClient;
    client.handleServerRequest("window/workDoneProgress/create", { token: "unbegun" });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(client.getRecoveryStallSignal()).toBe("readiness-stall");
  });

  it("reports no stall signal for a healthy running client", () => {
    const client = createRunningClient([]) as unknown as TestClient;

    expect(client.getRecoveryStallSignal()).toBeNull();
  });

  it("reports protocol-errors after repeated request failures", () => {
    const client = createRunningClient([]) as unknown as TestClient;
    client.rpc.getProtocolFailureCount = vi.fn(() => 3);

    expect(client.getRecoveryStallSignal()).toBe("protocol-errors");
  });

  it("reports no stall signal when the client is not running", async () => {
    const client = createRunningClient([]) as unknown as TestClient;
    client._status = "error";

    expect(client.getRecoveryStallSignal()).toBeNull();
  });
});
