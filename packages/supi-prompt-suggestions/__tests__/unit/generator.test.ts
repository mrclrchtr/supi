import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx as makePiContext } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadSupiConfig = vi.hoisted(() => vi.fn());
const mockRecordDebugEvent = vi.hoisted(() => vi.fn());
const mockResolveSuggestionModel = vi.hoisted(() => vi.fn());
const mockCallSuggestionModel = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSupiConfig: mockLoadSupiConfig,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mockRecordDebugEvent,
}));

vi.mock("../../src/generation/model-resolution.ts", () => ({
  resolveSuggestionModel: mockResolveSuggestionModel,
}));

vi.mock("../../src/generation/client.ts", () => ({
  callSuggestionModel: mockCallSuggestionModel,
  GENERATION_TIMEOUT_MS: 20_000,
}));

import type { SuggestionClientOutput } from "../../src/generation/client.ts";
import { type GenerationStatus, SuggestionGenerator } from "../../src/generation/generator.ts";

const MODEL: Model<Api> = {
  id: "suggestion-model",
  name: "Suggestion model",
  api: "openai-completions",
  provider: "test-provider",
  baseUrl: "https://provider.example/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 256,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeCtx(): ExtensionContext {
  return makePiContext({
    cwd: "/fake/project",
    modelRegistry: {},
    model: MODEL,
    sessionManager: { getSessionId: () => "pi-session" },
  }) as unknown as ExtensionContext;
}

function waitForStatus(
  statuses: GenerationStatus[],
  predicate: (status: GenerationStatus) => boolean,
): Promise<void> {
  return vi.waitFor(() => {
    expect(statuses.some(predicate)).toBe(true);
  });
}

describe("SuggestionGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSupiConfig.mockReturnValue({ model: "disabled" });
    mockResolveSuggestionModel.mockReturnValue(MODEL);
  });

  it("reports idle when suggestions are disabled or the assistant text is empty", () => {
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    const callbacks = { onStatus: (status: GenerationStatus) => statuses.push(status) };
    const ctx = makeCtx();

    generator.start(ctx, "assistant text", callbacks);
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/suggestion-model" });
    generator.start(ctx, "   ", callbacks);

    expect(statuses).toEqual([{ kind: "idle" }, { kind: "idle" }]);
    expect(mockCallSuggestionModel).not.toHaveBeenCalled();
  });

  it("reports an unavailable configured model without an auth preflight", async () => {
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/missing-model" });
    mockResolveSuggestionModel.mockReturnValue(undefined);
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(makeCtx(), "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await waitForStatus(statuses, (status) => status.kind === "error");

    expect(statuses.at(-1)).toMatchObject({
      kind: "error",
      warning: {
        kind: "model-unavailable",
        model: "test-provider/missing-model",
      },
    });
  });

  it("reports a ready normalized suggestion", async () => {
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/suggestion-model" });
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "fix the bug" });
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(makeCtx(), "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await waitForStatus(statuses, (status) => status.kind === "ready");

    expect(statuses.at(-1)).toEqual({ kind: "ready", suggestion: "fix the bug" });
    expect(mockCallSuggestionModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL, tail: "assistant text" }),
    );
  });

  it("carries safe failure metadata to status and debug events", async () => {
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/suggestion-model" });
    mockCallSuggestionModel.mockResolvedValue({
      ok: false,
      failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
    });
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(makeCtx(), "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await waitForStatus(statuses, (status) => status.kind === "error");

    expect(statuses.at(-1)).toEqual({
      kind: "error",
      warning: {
        model: "test-provider/suggestion-model",
        kind: "billing",
        httpStatus: 401,
        summary: "billing failed",
      },
    });
    expect(mockRecordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "generation.failure",
        data: expect.objectContaining({
          failure: { kind: "billing", httpStatus: 401, summary: "billing failed" },
        }),
      }),
    );
  });

  it("ignores a superseded request result", async () => {
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/suggestion-model" });
    const first = deferred<SuggestionClientOutput>();
    mockCallSuggestionModel.mockReturnValueOnce(first.promise);
    mockCallSuggestionModel.mockResolvedValueOnce({ ok: true, text: "second suggestion" });
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    const callbacks = { onStatus: (status: GenerationStatus) => statuses.push(status) };

    generator.start(makeCtx(), "first text", callbacks);
    generator.start(makeCtx(), "second text", callbacks);
    first.resolve({ ok: true, text: "stale suggestion" });

    await waitForStatus(
      statuses,
      (status) => status.kind === "ready" && status.suggestion === "second suggestion",
    );
    expect(statuses).not.toContainEqual({ kind: "ready", suggestion: "stale suggestion" });
  });

  it("dismisses a pending request without sending a status update", async () => {
    mockLoadSupiConfig.mockReturnValue({ model: "test-provider/suggestion-model" });
    const pending = deferred<SuggestionClientOutput>();
    mockCallSuggestionModel.mockReturnValue(pending.promise);
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(makeCtx(), "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await waitForStatus(statuses, (status) => status.kind === "generating");
    statuses.length = 0;
    generator.dismiss();
    pending.resolve({ ok: true, text: "stale suggestion" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(statuses).toEqual([]);
  });
});
