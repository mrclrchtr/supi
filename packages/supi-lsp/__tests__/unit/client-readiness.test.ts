// Unit tests for LspClient readiness state machine.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressToken } from "vscode-languageserver-protocol";
import { LspClient } from "../../src/client/client.ts";

// biome-ignore lint/suspicious/noExplicitAny: accessing private members for testing
type AnyClient = any;

function createClient(opts: { readinessTimeoutMs?: number } = {}): LspClient {
  const client = new LspClient(
    "test",
    {
      command: "echo",
      args: [],
      fileTypes: ["ts"],
      rootMarkers: ["tsconfig.json"],
      readinessTimeoutMs: opts.readinessTimeoutMs,
    },
    "/project",
  );
  // Simulate running state (no real process spawned)
  (client as AnyClient)._status = "running";
  (client as AnyClient).rpc = {
    sendNotification: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue({}),
    onNotification: vi.fn(),
    onRequest: vi.fn(),
    dispose: vi.fn(),
  };
  // Arm the no-progress timer using the same production method called by start()
  (client as AnyClient).armNoProgressTimer();
  return client;
}

/**
 * Simulate a `$/progress` notification arriving from the server.
 * Calls the private handleProgress method directly.
 */
function sendProgress(
  client: LspClient,
  token: ProgressToken,
  kind: "begin" | "report" | "end",
): void {
  const c = client as AnyClient;
  c.handleProgress?.({
    token,
    value: { kind, title: kind === "begin" ? "Indexing" : undefined },
  });
}

/**
 * Simulate `window/workDoneProgress/create` request from the server.
 */
function sendCreateProgress(client: LspClient, token: ProgressToken): void {
  const c = client as AnyClient;
  // Call the real handler path so per-token timeout is started
  c.handleServerRequest?.("window/workDoneProgress/create", { token });
}

/**
 * Assert that `getReady()` resolves within the current fake-timer tick.
 */
async function assertGetReadyResolves(client: LspClient): Promise<void> {
  const c = client as AnyClient;
  const readyPromise = c.getReady?.();
  if (!readyPromise) throw new Error("getReady is not implemented");
  await vi.advanceTimersByTimeAsync(0);
  await expect(readyPromise).resolves.toBeUndefined();
}

describe("LspClient readiness state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1: No progress → 2s window → ready ────────────────────────
  it("resolves ready after 2s when no progress token arrives", async () => {
    const client = createClient();

    // Initially not ready
    expect(client.ready).toBe(false);

    // Advance 2s to fire the no-progress timer
    await vi.advanceTimersByTimeAsync(2_000);

    expect(client.ready).toBe(true);
    await assertGetReadyResolves(client);
  });

  // ── Test 2: Single token → begin → end → ready ─────────────────────
  it("resolves ready after a single begin→end cycle", async () => {
    const client = createClient();

    sendCreateProgress(client, "token-1");
    sendProgress(client, "token-1", "begin");

    expect(client.ready).toBe(false);

    sendProgress(client, "token-1", "end");
    await vi.advanceTimersByTimeAsync(0);

    expect(client.ready).toBe(true);
    await assertGetReadyResolves(client);
  });

  // ── Test 3: Multi-token ─────────────────────────────────────────────
  it("resolves ready only after all concurrent tokens end", async () => {
    const client = createClient();

    sendCreateProgress(client, "token-1");
    sendProgress(client, "token-1", "begin");
    sendCreateProgress(client, "token-2");
    sendProgress(client, "token-2", "begin");

    expect(client.ready).toBe(false);

    // End token-1 first — still not ready
    sendProgress(client, "token-1", "end");
    await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(false);

    // End token-2 — now ready
    sendProgress(client, "token-2", "end");
    await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(true);
    await assertGetReadyResolves(client);
  });

  // ── Test 4: begin without end → per-token timeout → ready ──────────
  it("resolves ready after per-token timeout when no end arrives", async () => {
    const client = createClient({ readinessTimeoutMs: 100 });

    sendProgress(client, "token-1", "begin");
    expect(client.ready).toBe(false);

    // Advance past the per-token timeout
    await vi.advanceTimersByTimeAsync(100);
    expect(client.ready).toBe(true);
    await assertGetReadyResolves(client);
  });

  // ── Test 5: New begin after ready → re-opens readiness ──────────────
  it("flips ready to false on new begin and re-resolves on end", async () => {
    const client = createClient();

    // First, get to ready state
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.ready).toBe(true);

    // New begin arrives
    sendProgress(client, "token-2", "begin");
    await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(false);

    // End → ready again
    sendProgress(client, "token-2", "end");
    await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(true);
  });

  // ── Test 6: Crash during waiting → getReady() rejects ───────────────
  it("rejects getReady() when client crashes while waiting", async () => {
    const client = createClient();

    sendProgress(client, "token-1", "begin");
    expect(client.ready).toBe(false);

    // Start waiting
    const readyPromise = (client as AnyClient).getReady?.();
    if (!readyPromise) throw new Error("getReady is not implemented");

    // getReady() is async, so it returns a new promise that mirrors
    // _readyPromise — the production .catch() on _readyPromise does not
    // propagate to this wrapper. Catch it here to prevent unhandled rejection.
    readyPromise.catch(() => {});

    // Simulate crash: process exits with error status
    (client as AnyClient).rejectReady?.(new Error("Client crashed"));
    await vi.advanceTimersByTimeAsync(0);

    await expect(readyPromise).rejects.toThrow("Client crashed");
    expect(client.ready).toBe(false);
  });

  // ── Test 7: Shutdown while waiting → rejects pending ────────────────
  it("rejects getReady() when client shuts down while waiting", async () => {
    const client = createClient();

    sendProgress(client, "token-1", "begin");
    expect(client.ready).toBe(false);

    const readyPromise = (client as AnyClient).getReady?.();
    if (!readyPromise) throw new Error("getReady is not implemented");

    // getReady() is async, so it returns a new promise that mirrors
    // _readyPromise — the production .catch() on _readyPromise does not
    // propagate to this wrapper. Catch it here to prevent unhandled rejection.
    readyPromise.catch(() => {});

    // Shutdown: clear readiness state
    (client as AnyClient).rejectReady?.(new Error("Client shutdown"));
    await vi.advanceTimersByTimeAsync(0);

    await expect(readyPromise).rejects.toThrow("Client shutdown");
    expect(client.ready).toBe(false);
  });

  // ── Test 8: Token cleanup after end ─────────────────────────────────
  it("cleans up trackedTokens and tokenTimeouts after end", async () => {
    const client = createClient({ readinessTimeoutMs: 100 });

    sendProgress(client, "token-1", "begin");

    // Verify token is tracked before end
    const trackedBefore = (client as AnyClient).trackedTokens;
    expect(trackedBefore?.size).toBeGreaterThanOrEqual(1);

    sendProgress(client, "token-1", "end");
    await vi.advanceTimersByTimeAsync(0);

    // After end + all-tokens-check, trackedTokens should be cleared
    const trackedAfter = (client as AnyClient).trackedTokens;
    expect(trackedAfter?.size ?? 0).toBe(0);

    // tokenTimeouts should also be cleared
    const timeoutsAfter = (client as AnyClient).tokenTimeouts;
    expect(timeoutsAfter?.size ?? 0).toBe(0);
  });

  // ── Test 9: getReady() resolves when ready is already true ──────────
  it("resolves getReady() immediately when already ready", async () => {
    const client = createClient();

    // Get to ready state via no-progress timer
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.ready).toBe(true);

    // getReady() should resolve immediately without waiting
    const readyPromise = (client as AnyClient).getReady?.();
    if (!readyPromise) throw new Error("getReady is not implemented");
    await expect(readyPromise).resolves.toBeUndefined();
  });

  // ── Test 10: No-progress timer cancelled by window/workDoneProgress/create ──
  it("does not resolve ready at 2s when create arrives before timer fires", async () => {
    const client = createClient();

    // Send create request at 1s (before the 2s timer fires)
    await vi.advanceTimersByTimeAsync(1_000);
    sendCreateProgress(client, "token-1");

    // Advance to 2s+ — timer should have been cancelled
    await vi.advanceTimersByTimeAsync(1_500);
    expect(client.ready).toBe(false); // still waiting for begin/end
  });

  // ── Test 11: No-progress timer cancelled by $/progress begin (no prior create) ──
  it("does not resolve ready at 2s when begin arrives without prior create", async () => {
    const client = createClient();

    // Send begin directly at 1s (server skips create)
    await vi.advanceTimersByTimeAsync(1_000);
    sendProgress(client, "token-1", "begin");

    // Advance to 2s+ — timer should have been cancelled by handleProgress
    await vi.advanceTimersByTimeAsync(1_500);
    expect(client.ready).toBe(false); // still waiting for end
  });

  // ── Test 12: Crash before no-progress timer leaves ready false ──────
  it("does not resolve ready at 2s after client crash", async () => {
    const client = createClient();

    // Crash at 1s — exit handler cancels timer then rejects
    await vi.advanceTimersByTimeAsync(1_000);
    (client as AnyClient).cancelNoProgressTimer?.();
    (client as AnyClient).rejectReady?.(new Error("Client crashed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(false);

    // Advance past 2s — timer was cancelled, ready stays false
    await vi.advanceTimersByTimeAsync(1_500);
    expect(client.ready).toBe(false);
  });

  // ── Test 13: create without begin → timeout resolves ready ─────────
  it("resolves ready via per-token timeout when create arrives without begin", async () => {
    const client = createClient({ readinessTimeoutMs: 100 });

    sendCreateProgress(client, "token-1");
    expect(client.ready).toBe(false);

    // No begin ever sent — timeout should fire
    await vi.advanceTimersByTimeAsync(100);
    expect(client.ready).toBe(true);
  });

  // ── Test 14: process error handler rejects pending readiness ────────
  it("rejects getReady() when process error fires", async () => {
    const client = createClient();

    sendProgress(client, "token-1", "begin");
    expect(client.ready).toBe(false);

    const readyPromise = (client as AnyClient).getReady?.();
    if (!readyPromise) throw new Error("getReady is not implemented");
    // getReady() is async, so it returns a new promise that mirrors
    // _readyPromise — the production .catch() on _readyPromise does not
    // propagate to this wrapper. Catch it here to prevent unhandled rejection.
    readyPromise.catch(() => {});

    // Simulate process error (no exit event)
    (client as AnyClient).rejectReady?.(new Error("Client process error"));
    await vi.advanceTimersByTimeAsync(0);

    await expect(readyPromise).rejects.toThrow("Client process error");
    expect(client.ready).toBe(false);
  });

  // ── Test 15: getReady() after crash does not auto-resolve ──────────
  it("does not auto-resolve getReady() after crash when status is error", async () => {
    const client = createClient();

    // Simulate crash: cancel timer, reject readiness, set status to error
    (client as AnyClient).cancelNoProgressTimer?.();
    (client as AnyClient).rejectReady?.(new Error("Client crashed"));
    (client as AnyClient)._status = "error";
    await vi.advanceTimersByTimeAsync(0);

    // After crash, getReady() must not set isReady to true
    const readyPromise = (client as AnyClient).getReady?.();
    await vi.advanceTimersByTimeAsync(0);

    // getReady() returns a resolved promise (immediate-return path),
    // but must not flip isReady because the client crashed.
    await expect(readyPromise).resolves.toBeUndefined();
    expect(client.ready).toBe(false);
  });

  // ── Test 16: getReady() after shutdown does not auto-resolve ───────
  it("does not auto-resolve getReady() after shutdown when status is shutdown", async () => {
    const client = createClient();

    // Simulate shutdown: cancel timer, reject readiness, set status to shutdown
    (client as AnyClient).cancelNoProgressTimer?.();
    (client as AnyClient).rejectReady?.(new Error("Client shutdown"));
    (client as AnyClient)._status = "shutdown";
    await vi.advanceTimersByTimeAsync(0);

    const readyPromise = (client as AnyClient).getReady?.();
    await vi.advanceTimersByTimeAsync(0);

    await expect(readyPromise).resolves.toBeUndefined();
    expect(client.ready).toBe(false);
  });

  // ── Test 17: request() returns null after crash ─────────────────────
  it("returns null from semantic requests after crash", async () => {
    const client = createClient();

    // Let the no-progress timer fire so the client becomes ready initially
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.ready).toBe(true);

    // Crash the client: cancel timer, reject readiness, set status to error
    (client as AnyClient).cancelNoProgressTimer?.();
    (client as AnyClient).rejectReady?.(new Error("Client crashed"));
    (client as AnyClient)._status = "error";
    // Clear the rpc reference so the early-return guard in request() fires
    (client as AnyClient).rpc = null;
    await vi.advanceTimersByTimeAsync(0);

    // All semantic methods go through request() which returns null
    // when the client is not running.
    expect(await client.hover("test.ts", { line: 0, character: 0 })).toBeNull();
    expect(await client.definition("test.ts", { line: 0, character: 0 })).toBeNull();
    expect(await client.references("test.ts", { line: 0, character: 0 })).toBeNull();
    expect(await client.documentSymbols("test.ts")).toBeNull();
    expect(await client.workspaceSymbol("foo")).toBeNull();
    expect(await client.rename("test.ts", { line: 0, character: 0 }, "newName")).toBeNull();
    expect(
      await client.codeActions(
        "test.ts",
        { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        { diagnostics: [], only: [] },
      ),
    ).toBeNull();
  });

  // ── Test 18: request() catches sendRequest errors ──────────────────
  it("returns null when rpc.sendRequest throws", async () => {
    const client = createClient();

    // Let the no-progress timer fire so the client becomes ready
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.ready).toBe(true);

    // Make the RPC sendRequest throw
    (client as AnyClient).rpc.sendRequest = vi
      .fn()
      .mockRejectedValue(new Error("RPC connection lost"));

    // request() catches the error and returns null
    const result = await client.hover("test.ts", { line: 0, character: 0 });
    expect(result).toBeNull();
  });
});
