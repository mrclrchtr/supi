import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMessageConnection,
  type MessageConnection,
  NullLogger,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import { JsonRpcClient, JsonRpcRequestError } from "../../src/client/transport.ts";

/**
 * Creates a client JsonRpcClient connected to a server MessageConnection
 * via two PassThrough streams (cross-connected).
 *
 *       client.writer → serverIn → server.reader
 *       client.reader ← serverOut ← server.writer
 */
function createServerPair(): {
  client: JsonRpcClient;
  serverIn: PassThrough;
  serverOut: PassThrough;
  server: MessageConnection;
} {
  const serverIn = new PassThrough();
  const serverOut = new PassThrough();

  // Client reads from serverOut, writes to serverIn
  const client = new JsonRpcClient(serverOut, serverIn);

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
    const pair = createServerPair();
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

  it("rejects on error response", async () => {
    server.onRequest("bad/method", () => {
      throw new JsonRpcRequestError(-32601, "Method not found");
    });

    await expect(client.sendRequest("bad/method")).rejects.toThrow("Method not found");
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

  it("rejects pending requests on dispose", async () => {
    const promise = client.sendRequest("will/dispose");
    client.dispose();
    await expect(promise).rejects.toThrow();
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
    } finally {
      shortClient.dispose();
      deadInput.destroy();
      deadOutput.destroy();
    }
  });
});
