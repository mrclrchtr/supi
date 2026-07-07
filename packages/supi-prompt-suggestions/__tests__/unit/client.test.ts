import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompleteSimple = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({
  completeSimple: mockCompleteSimple,
}));

import { buildPrompt, callSuggestionModel } from "../../src/generation/client.ts";

describe("buildPrompt", () => {
  it("includes the tail text inside assistant_message tags", () => {
    const prompt = buildPrompt("some assistant text");
    expect(prompt).toContain("<assistant_message>\nsome assistant text\n</assistant_message>");
  });

  it("ends with the Suggestion: trigger", () => {
    const prompt = buildPrompt("text");
    expect(prompt).toMatch(/Suggestion:\s*$/);
  });

  it("formats the assistant message only, no inline instructions", () => {
    const prompt = buildPrompt("do X");
    expect(prompt).toBe("<assistant_message>\ndo X\n</assistant_message>\n\nSuggestion:");
  });
});

describe("callSuggestionModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports provider error before checking content", async () => {
    mockCompleteSimple.mockResolvedValue({ stopReason: "error", errorMessage: "boom" });

    const result = await callSuggestionModel({
      model: { provider: "test", id: "model" },
      auth: { apiKey: "key" },
      tail: "assistant text",
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ ok: false, message: "Suggestion model failed: boom" });
  });

  it("passes auth environment through to completeSimple", async () => {
    const signal = new AbortController().signal;
    mockCompleteSimple.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text: "next" }],
    });

    await callSuggestionModel({
      model: { provider: "test", id: "model" },
      auth: { apiKey: "key", headers: { "x-test": "true" }, env: { TEST_ENV: "1" } },
      tail: "assistant text",
      signal,
    });

    expect(mockCompleteSimple).toHaveBeenCalledWith(
      { provider: "test", id: "model" },
      expect.any(Object),
      { apiKey: "key", headers: { "x-test": "true" }, env: { TEST_ENV: "1" }, signal },
    );
  });
});
