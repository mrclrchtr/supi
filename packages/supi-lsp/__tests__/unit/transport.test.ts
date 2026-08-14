import { PassThrough } from "node:stream";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMessageConnection,
  type MessageConnection,
  NullLogger,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import { JsonRpcClient, JsonRpcRequestError } from "../../src/client/transport.ts";
import { LSP_REQUEST_TIMEOUT_ERROR_CODE } from "../../src/debug-telemetry.ts";

/**
 * Creates a client JsonRpcClient connected to a server MessageConnection
 * via two PassThrough streams (cross-connected).
 *
 *       client.writer → serverIn → server.reader
 *       client.reader ← serverOut ← server.writer
 */
function createServerPair(identity?: { server?: string; cwd?: string }): {
  client: JsonRpcClient;
  serverIn: PassThrough;
  serverOut: PassThrough;
  server: MessageConnection;
} {
  const serverIn = new PassThrough();
  const serverOut = new PassThrough();

  // Client reads from serverOut, writes to serverIn
  const client = new JsonRpcClient(serverOut, serverIn, identity);

  // Server reads from serverIn, writes to serverOut
  const server = createMessageConnection(
    new StreamMessageReader(serverIn),
    new StreamMessageWriter(serverOut),
    NullLogger,
  );
  server.listen();

  return { client, serverIn, serverOut, server };
}

// biome-ignore lint/security/noSecrets: test class name, not a secret
describe("JsonRpcClient", () => {
  let client: JsonRpcClient;
  let server: MessageConnection;
  let serverIn: PassThrough;
  let serverOut: PassThrough;

  beforeEach(() => {
    configureDebugRegistry({ enabled: true, maxEvents: 100 });
    const pair = createServerPair({ server: "typescript", cwd: "/workspace" });
    client = pair.client;
    server = pair.server;
    serverIn = pair.serverIn;
    serverOut = pair.serverOut;
  });

  afterEach(() => {
    // Dispose connections first so they stop writing before streams are destroyed
    try {
      client.dispose();
    } catch {
      // Suppress rejections
    }
    try {
      server.dispose();
    } catch {
      // Suppress
    }
    // Give pending writes a chance to drain before destroying streams
    serverIn.removeAllListeners();
    serverOut.removeAllListeners();
    vi.restoreAllMocks();
    resetDebugRegistry();
  });

  it("records a sanitized request timing observation with exact method identity", async () => {
    server.onRequest("textDocument/hover", () => ({ contents: "ok" }));

    await client.sendRequest("textDocument/hover", {
      textDocument: { uri: "file:///private/source.ts" },
      source: "secret source text",
      command: "private-command --token=secret",
    });

    const events = getDebugEvents({ source: "lsp", category: "request.timing" }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "LSP semantic request completed for textDocument/hover",
        cwd: "/workspace",
        data: {
          method: "textDocument/hover",
          methodClass: "semantic",
          outcome: "completed",
          server: "typescript",
          timing: {
            durationMs: expect.any(Number),
            phasesMs: { request: expect.any(Number) },
          },
        },
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("/private/source.ts");
    expect(JSON.stringify(events)).not.toContain("secret source text");
    expect(JSON.stringify(events)).not.toContain("private-command");
  });

  it("omits identity when the transport was constructed without it", async () => {
    const pair = createServerPair();
    pair.server.onRequest("textDocument/hover", () => ({ contents: "ok" }));

    await pair.client.sendRequest("textDocument/hover");

    const events = getDebugEvents({ source: "lsp", category: "request.timing" }).events;
    expect(events[0]?.cwd).toBeUndefined();
    expect(events[0]?.data).toEqual(
      expect.objectContaining({ method: "textDocument/hover", methodClass: "semantic" }),
    );
    expect(events[0]?.data).not.toHaveProperty("server");
    try {
      pair.client.dispose();
    } catch {
      // Suppress rejections
    }
    try {
      pair.server.dispose();
    } catch {
      // Suppress
    }
  });

  it("attaches explicit request ownership but leaves direct requests ambient", async () => {
    const operationId = "op-AAAAAAAAAAAAAAAAAAAAAA";
    server.onRequest("textDocument/hover", () => ({ contents: "ok" }));

    await client.sendRequest("textDocument/hover", undefined, { operationId });
    await client.sendRequest("textDocument/hover");

    const events = getDebugEvents({ source: "lsp", category: "request.timing" }).events;
    expect(events).toHaveLength(2);
    expect(events.filter((event) => event.operationId === operationId)).toHaveLength(1);
    expect(events.filter((event) => event.operationId === undefined)).toHaveLength(1);
  });

  it("correlates response by id", async () => {
    // Set up server to respond to "initialize" requests
    server.onRequest("initialize", (params) => {
      return { capabilities: params };
    });

    const result = await client.sendRequest("initialize", { processId: 1 });
    expect(result).toEqual({ capabilities: { processId: 1 } });
  });

  it("handles multiple concurrent requests", async () => {
    server.onRequest("method1", () => "first");
    server.onRequest("method2", () => "second");

    const [r1, r2] = await Promise.all([
      client.sendRequest("method1"),
      client.sendRequest("method2"),
    ]);

    expect(r1).toBe("first");
    expect(r2).toBe("second");
  });

  it("rejects on error response and records the JSON-RPC error code", async () => {
    server.onRequest("bad/method", () => {
      throw new JsonRpcRequestError(-32601, "Method not found");
    });

    await expect(client.sendRequest("bad/method")).rejects.toThrow("Method not found");
    expect(getDebugEvents({ source: "lsp", category: "request.timing" }).events[0]?.data).toEqual(
      expect.objectContaining({
        method: "bad/method",
        methodClass: "other",
        outcome: "failed",
        errorCode: -32601,
      }),
    );
  });

  it("dispatches notifications to handler", async () => {
    const received: Array<{ method: string; params: unknown }> = [];
    client.onNotification((method, params) => {
      received.push({ method, params });
    });

    await server.sendNotification("textDocument/publishDiagnostics", {
      uri: "file:///a.ts",
      diagnostics: [],
    });

    // Give microtask queue a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("textDocument/publishDiagnostics");
  });

  it("responds to server requests through the registered request handler", async () => {
    client.onRequest((method, params) => ({ method, params }));

    const result = await server.sendRequest("workspace/configuration", {
      items: [],
    });
    expect(result).toEqual({
      method: "workspace/configuration",
      params: { items: [] },
    });
  });

  it("returns Method not found for server requests without a registered handler", async () => {
    await expect(server.sendRequest("workspace/configuration", { items: [] })).rejects.toThrow(
      "Method not found",
    );
  });

  it("records cancellation when dispose rejects a pending request", async () => {
    const promise = client.sendRequest("textDocument/references");
    client.dispose();
    await expect(promise).rejects.toThrow();

    expect(getDebugEvents({ source: "lsp", category: "request.timing" }).events[0]?.data).toEqual(
      expect.objectContaining({
        method: "textDocument/references",
        methodClass: "semantic",
        outcome: "cancelled",
      }),
    );
  });

  it("handles per-request timeout overrides", async () => {
    // Server never responds to this method
    const promise = client.sendRequest("slow/override", undefined, {
      timeoutMs: 50,
    });
    await expect(promise).rejects.toThrow();
  });

  it("times out pending requests with per-request timeout", async () => {
    // Create a client connected to a stream that never responds
    const deadInput = new PassThrough();
    const deadOutput = new PassThrough();
    const shortClient = new JsonRpcClient(deadInput, deadOutput, {
      timeoutMs: 30_000,
    });
    try {
      // Override with short per-request timeout
      const promise = shortClient.sendRequest("slow/method", undefined, {
        timeoutMs: 50,
      });
      await expect(promise).rejects.toThrow("timed out");
      expect(getDebugEvents({ source: "lsp", category: "request.timing" }).events[0]?.data).toEqual(
        expect.objectContaining({
          method: "slow/method",
          methodClass: "other",
          outcome: "timed-out",
          // A local timeout records the defined timeout error code.
          errorCode: LSP_REQUEST_TIMEOUT_ERROR_CODE,
        }),
      );
    } finally {
      shortClient.dispose();
      deadInput.destroy();
      deadOutput.destroy();
    }
  });

  it("clears the request timer after a successful response", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    server.onRequest("fast/success", () => "done");

    const request = client.sendRequest("fast/success", undefined, { timeoutMs: 12_345 });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 12_345);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    await expect(request).resolves.toBe("done");
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("clears the request timer after an error response", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    server.onRequest("fast/error", () => {
      throw new Error("server failure");
    });

    const request = client.sendRequest("fast/error", undefined, { timeoutMs: 12_346 });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 12_346);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    await expect(request).rejects.toThrow("server failure");
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("clears the request timer after timeout", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    server.onRequest("slow/timer", () => new Promise(() => {}));
    const request = client.sendRequest("slow/timer", undefined, { timeoutMs: 30 });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 30);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    await expect(request).rejects.toThrow("timed out");
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("cancels an in-flight request and clears its timer when aborted", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const controller = new AbortController();
    server.onRequest("slow/abort", () => new Promise(() => {}));
    const request = client.sendRequest("slow/abort", undefined, {
      timeoutMs: 12_348,
      signal: controller.signal,
    });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 12_348);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    controller.abort(new Error("request cancelled by caller"));

    await expect(request).rejects.toThrow("request cancelled by caller");
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("rejects with a deadline error when the absolute deadline has already elapsed", async () => {
    server.onRequest("slow/expired", () => new Promise(() => {}));
    const request = client.sendRequest("slow/expired", undefined, {
      timeoutMs: 12_349,
      deadline: Date.now() - 1,
    });

    await expect(request).rejects.toThrow("Code request deadline exceeded");
  });

  it("bounds the request timer by the absolute deadline when it is earlier than the timeout", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    server.onRequest("slow/deadline", () => new Promise(() => {}));
    const request = client.sendRequest("slow/deadline", undefined, {
      timeoutMs: 12_350,
      deadline: Date.now() + 30,
    });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 30);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    await expect(request).rejects.toThrow("Code request deadline exceeded");
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it("clears the request timer when the client is disposed", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    server.onRequest("slow/dispose", () => new Promise(() => {}));
    const request = client.sendRequest("slow/dispose", undefined, { timeoutMs: 12_347 });
    const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 12_347);
    const timer = setTimeoutSpy.mock.results[timerIndex]?.value;

    client.dispose();

    await expect(request).rejects.toThrow();
    expect(timer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });
});
