import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonRpcClient, JsonRpcRequestError } from "../../src/client/transport.ts";

function createPair() {
  const serverIn = new PassThrough(); // client writes here (server stdin)
  const serverOut = new PassThrough(); // server writes here (client reads)
  const client = new JsonRpcClient(serverOut, serverIn);
  return { client, serverIn, serverOut };
}

function writeMessage(stream: PassThrough, body: object) {
  const json = JSON.stringify(body);
  const header = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n`;
  stream.write(header + json);
}

async function readWrittenMessage(stream: PassThrough): Promise<Record<string, unknown>> {
  const chunk = await new Promise<Buffer>((resolve) => {
    stream.once("data", (data: Buffer) => resolve(data));
  });
  const raw = chunk.toString("utf-8");
  const body = raw.split("\r\n\r\n")[1] ?? "{}";
  return JSON.parse(body) as Record<string, unknown>;
}

// biome-ignore lint/security/noSecrets: test class name, not a secret
describe("JsonRpcClient", () => {
  let client: JsonRpcClient;
  let serverIn: PassThrough;
  let serverOut: PassThrough;

  beforeEach(() => {
    const pair = createPair();
    client = pair.client;
    serverIn = pair.serverIn;
    serverOut = pair.serverOut;
  });

  afterEach(() => {
    try {
      client.dispose();
    } catch {
      // Suppress rejections from pending requests during cleanup
    }
    serverIn.removeAllListeners();
    serverOut.removeAllListeners();
    serverIn.destroy();
    serverOut.destroy();
  });

  it("sends request with Content-Length header and JSON body", () => {
    const chunks: Buffer[] = [];
    serverIn.on("data", (chunk: Buffer) => chunks.push(chunk));

    client.sendRequest("initialize", { processId: 1 });

    const raw = Buffer.concat(chunks).toString("utf-8");
    expect(raw).toContain("Content-Length:");
    expect(raw).toContain('"method":"initialize"');
    expect(raw).toContain('"id":1');
  });

  it("correlates response by id", async () => {
    const promise = client.sendRequest("textDocument/hover", { position: { line: 0 } });

    // Simulate server response
    writeMessage(serverOut, { jsonrpc: "2.0", id: 1, result: { contents: "hello" } });

    const result = await promise;
    expect(result).toEqual({ contents: "hello" });
  });

  it("handles multiple concurrent requests", async () => {
    const p1 = client.sendRequest("method1");
    const p2 = client.sendRequest("method2");

    // Respond out of order
    writeMessage(serverOut, { jsonrpc: "2.0", id: 2, result: "second" });
    writeMessage(serverOut, { jsonrpc: "2.0", id: 1, result: "first" });

    expect(await p1).toBe("first");
    expect(await p2).toBe("second");
  });

  it("rejects on error response", async () => {
    const promise = client.sendRequest("bad/method");

    writeMessage(serverOut, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });

    await expect(promise).rejects.toThrow("Method not found");
  });

  it("dispatches notifications to handler", async () => {
    const received: Array<{ method: string; params: unknown }> = [];
    client.onNotification((method, params) => {
      received.push({ method, params });
    });

    writeMessage(serverOut, {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///a.ts", diagnostics: [] },
    });

    // Give the event loop a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("textDocument/publishDiagnostics");
  });

  it("sends notifications without id", () => {
    const chunks: Buffer[] = [];
    serverIn.on("data", (chunk: Buffer) => chunks.push(chunk));

    client.sendNotification("initialized", {});

    const raw = Buffer.concat(chunks).toString("utf-8");
    expect(raw).toContain('"method":"initialized"');
    expect(raw).not.toContain('"id"');
  });

  it("responds to server requests through the registered request handler", async () => {
    client.onRequest((method, params) => ({ method, params }));

    writeMessage(serverOut, {
      jsonrpc: "2.0",
      id: 7,
      method: "workspace/configuration",
      params: { items: [] },
    });

    const response = await readWrittenMessage(serverIn);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 7,
      result: { method: "workspace/configuration", params: { items: [] } },
    });
  });

  it("returns Method not found for server requests without a registered handler", async () => {
    writeMessage(serverOut, {
      jsonrpc: "2.0",
      id: 8,
      method: "workspace/configuration",
      params: { items: [] },
    });

    const response = await readWrittenMessage(serverIn);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 8,
      error: {
        code: -32601,
        message: "Method not found: workspace/configuration",
      },
    });
  });

  it("serializes request handler failures as JSON-RPC errors", async () => {
    client.onRequest(() => {
      throw new JsonRpcRequestError(-32602, "Invalid params");
    });

    writeMessage(serverOut, {
      jsonrpc: "2.0",
      id: 9,
      method: "workspace/configuration",
      params: { items: [] },
    });

    const response = await readWrittenMessage(serverIn);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 9,
      error: {
        code: -32602,
        message: "Invalid params",
      },
    });
  });

  it("handles partial messages split across chunks", async () => {
    const promise = client.sendRequest("test/partial");

    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "ok" });
    const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
    const full = header + body;

    // Split in the middle
    const mid = Math.floor(full.length / 2);
    serverOut.write(full.slice(0, mid));
    await new Promise((r) => setTimeout(r, 5));
    serverOut.write(full.slice(mid));

    expect(await promise).toBe("ok");
  });

  it("rejects pending requests on dispose", async () => {
    const promise = client.sendRequest("will/dispose");
    client.dispose();
    await expect(promise).rejects.toThrow("disposed");
  });

  it("rejects pending requests when connection closes", async () => {
    const promise = client.sendRequest("will/close");
    serverOut.emit("end");
    await expect(promise).rejects.toThrow("closed");
  });
});

// biome-ignore lint/security/noSecrets: test suite name, not a secret
describe("JsonRpcClient request timeouts", () => {
  it("uses per-request timeout overrides", async () => {
    const { client, serverIn, serverOut } = createPair();
    const promise = client.sendRequest("slow/override", undefined, { timeoutMs: 20 });
    await expect(promise).rejects.toThrow("timed out after 20ms");
    client.dispose();
    serverIn.destroy();
    serverOut.destroy();
  });

  it("times out pending requests", async () => {
    const isolated = createPair();
    const shortClient = new JsonRpcClient(isolated.serverOut, isolated.serverIn, {
      timeoutMs: 50,
    });
    const promise = shortClient.sendRequest("slow/method");
    await expect(promise).rejects.toThrow("timed out");
    shortClient.dispose();
    isolated.serverIn.destroy();
    isolated.serverOut.destroy();
  });
});
