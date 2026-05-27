import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractJsonFromResponse, withRetry } from "../../src/llm.ts";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and returns result on success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const resultPromise = withRetry(fn, { baseDelayMs: 10 });
    // Advance past retry delays
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("returns null when all attempts fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    const resultPromise = withRetry(fn, { retries: 2, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("returns null when the signal is aborted during the retry delay", async () => {
    const ac = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const resultPromise = withRetry(fn, { signal: ac.signal, baseDelayMs: 1000 });
    // Let the first call fail and the delay timer start
    await vi.advanceTimersByTimeAsync(10);
    // fn has been called once, now abort
    expect(fn).toHaveBeenCalledTimes(1);
    ac.abort();
    // Advance past any remaining delay timers
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result).toBeNull();
    // Should only have been called once (no retry after abort)
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls the logger with each failure", async () => {
    const logger = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const resultPromise = withRetry(fn, { logger, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe("ok");
    expect(logger).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenNthCalledWith(1, 0, expect.any(Error));
    expect(logger).toHaveBeenNthCalledWith(2, 1, expect.any(Error));
  });

  it("calls the onRetry callback before each retry delay", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const resultPromise = withRetry(fn, { onRetry, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe("ok");
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 0, 10); // attempt=0, delay=10
    expect(onRetry).toHaveBeenNthCalledWith(2, 1, 20); // attempt=1, delay=20
  });

  it("respects a custom retry count", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const resultPromise = withRetry(fn, { retries: 5, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(6); // initial + 5 retries
  });

  it("resolves immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { signal: ac.signal });
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns null when signal aborts during a delay", async () => {
    const ac = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const resultPromise = withRetry(fn, { signal: ac.signal, baseDelayMs: 1000 });

    // Let the first call fail, then abort during the delay
    await vi.advanceTimersByTimeAsync(10);
    ac.abort();

    const result = await resultPromise;
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1); // only the initial attempt
  });

  it("uses default options when none provided", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("extractJsonFromResponse", () => {
  const TestSchema = Type.Object({
    name: Type.String(),
    count: Type.Number(),
  });

  it("extracts JSON from text content blocks", () => {
    const content = [{ type: "text" as const, text: '{"name":"test","count":42}' }];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toEqual({ parsed: { name: "test", count: 42 } });
  });

  it("joins multiple text blocks and extracts JSON", () => {
    const content = [
      { type: "text" as const, text: "Some prefix text" },
      { type: "text" as const, text: '{"name":"test","count":42}' },
      { type: "text" as const, text: "suffix" },
    ];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toEqual({ parsed: { name: "test", count: 42 } });
  });

  it("finds JSON inside markdown code fences", () => {
    const content = [
      {
        type: "text" as const,
        text: 'Here is the result:\n```json\n{"name":"test","count":42}\n```',
      },
    ];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toEqual({ parsed: { name: "test", count: 42 } });
  });

  it("returns null for non-JSON text", () => {
    const content = [{ type: "text" as const, text: "Hello world" }];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toBeNull();
  });

  it("returns null when JSON doesn't match the schema", () => {
    const content = [{ type: "text" as const, text: '{"wrong":"data"}' }];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    const content = [{ type: "text" as const, text: "{invalid json}" }];
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toBeNull();
  });

  it("returns null for empty content array", () => {
    const result = extractJsonFromResponse([], TestSchema);
    expect(result).toBeNull();
  });

  it("handles nested object schemas", () => {
    const NestedSchema = Type.Object({
      user: Type.Object({
        id: Type.Number(),
        email: Type.String(),
      }),
      tags: Type.Array(Type.String()),
    });
    const content = [
      {
        type: "text" as const,
        text: JSON.stringify({ user: { id: 1, email: "a@b.com" }, tags: ["x", "y"] }),
      },
    ];
    const result = extractJsonFromResponse(content, NestedSchema);
    expect(result).toEqual({
      parsed: { user: { id: 1, email: "a@b.com" }, tags: ["x", "y"] },
    });
  });

  it("returns null when required fields are missing", () => {
    const content = [{ type: "text" as const, text: '{"name":"test"}' }]; // missing "count"
    const result = extractJsonFromResponse(content, TestSchema);
    expect(result).toBeNull();
  });
});
