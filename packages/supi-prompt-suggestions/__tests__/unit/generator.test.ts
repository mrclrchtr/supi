import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockLoadSectionConfig = vi.hoisted(() => vi.fn());
const mockRecordDebugEvent = vi.hoisted(() => vi.fn());
const mockResolveSuggestionAuth = vi.hoisted(() => vi.fn());
const mockCallSuggestionModel = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/config", () => ({
  loadSectionConfig: mockLoadSectionConfig,
}));

vi.mock("@mrclrchtr/supi-core/debug", () => ({
  recordDebugEvent: mockRecordDebugEvent,
}));

vi.mock("../../src/generation/model-resolution.ts", () => ({
  resolveSuggestionAuth: mockResolveSuggestionAuth,
}));

vi.mock("../../src/generation/client.ts", () => ({
  callSuggestionModel: mockCallSuggestionModel,
  GENERATION_TIMEOUT_MS: 20_000,
}));

import { SuggestionGenerator } from "../../src/generation/generator.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockAuthOk = {
  kind: "ok" as const,
  auth: {
    model: { provider: "anthropic", id: "claude-sonnet-4-5" },
    apiKey: "test-key",
    headers: undefined,
  },
};

function makeCtx(overrides: { cwd?: string } = {}) {
  return {
    cwd: overrides.cwd ?? "/fake/project",
    modelRegistry: {
      getApiKeyAndHeaders: vi.fn(),
    },
    model: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SuggestionGenerator", () => {
  let generator: SuggestionGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new SuggestionGenerator();
    mockLoadSectionConfig.mockReturnValue({ model: "disabled" });
  });

  // ── Skip paths (synchronous) ─────────────────────────────────

  it("reports idle when model is disabled", () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "disabled" });

    generator.start(makeCtx() as never, "some assistant text", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "idle" });
    expect(mockRecordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({ category: "generation.skipped" }),
    );
  });

  it("reports idle when lastAssistantText is empty", () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/some-model" });

    generator.start(makeCtx() as never, "   ", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "idle" });
    expect(mockRecordDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({ category: "generation.skipped" }),
    );
  });

  it("reports idle when lastAssistantText is empty string", () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/some-model" });

    generator.start(makeCtx() as never, "", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "idle" });
  });

  // ── Auth error ──────────────────────────────────────────────

  it("reports error when auth resolution fails", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockResolveSuggestionAuth.mockResolvedValue({
      kind: "error",
      message: 'Suggestion model "anthropic/nonexistent" not in scoped set',
    });

    generator.start(makeCtx() as never, "some text", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        kind: "error",
        message: 'Suggestion model "anthropic/nonexistent" not in scoped set',
      });
    });
  });

  // ── Successful generation ────────────────────────────────────

  it("reports ready when suggestion is successfully generated", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockResolveSuggestionAuth.mockResolvedValue(mockAuthOk);
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "fix the bug" });

    generator.start(makeCtx() as never, "some text", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        kind: "ready",
        suggestion: "fix the bug",
      });
    });
  });

  // ── Model call error ─────────────────────────────────────────

  it("reports error when model call fails", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockResolveSuggestionAuth.mockResolvedValue(mockAuthOk);
    mockCallSuggestionModel.mockResolvedValue({
      ok: false,
      message: "Model overloaded",
    });

    generator.start(makeCtx() as never, "some text", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        kind: "error",
        message: "Model overloaded",
      });
    });
  });

  // ── Empty normalized suggestion ──────────────────────────────

  it("reports idle when normalized suggestion is empty", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });
    mockResolveSuggestionAuth.mockResolvedValue(mockAuthOk);
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "" });

    generator.start(makeCtx() as never, "some text", { onStatus });

    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({ kind: "idle" });
    });
  });

  // ── Concurrency ──────────────────────────────────────────────

  it("cancels previous generation when start is called again", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });

    // First generation: auth hangs
    const auth1 = deferred<typeof mockAuthOk>();
    mockResolveSuggestionAuth.mockReturnValueOnce(auth1.promise);
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "second suggestion" });

    // Start first generation
    generator.start(makeCtx() as never, "text one", { onStatus });
    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });
    onStatus.mockClear();

    // Start second generation (cancels first)
    mockResolveSuggestionAuth.mockResolvedValueOnce(mockAuthOk);
    generator.start(makeCtx() as never, "text two", { onStatus });
    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });
    onStatus.mockClear();

    // Resolve first auth — should be ignored (ID mismatch)
    auth1.resolve(mockAuthOk);

    // Second generation should complete normally
    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        kind: "ready",
        suggestion: "second suggestion",
      });
    });
  });

  // ── Dismiss ──────────────────────────────────────────────────

  it("dismiss cancels in-flight generation and invalidates generation ID", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });

    const auth = deferred<typeof mockAuthOk>();
    mockResolveSuggestionAuth.mockReturnValue(auth.promise);

    generator.start(makeCtx() as never, "some text", { onStatus });
    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });
    onStatus.mockClear();

    // Dismiss while auth is still pending
    generator.dismiss();

    // Resolve auth — should be ignored (ID mismatch)
    auth.resolve(mockAuthOk);

    // Give time for async to settle — onStatus should not be called again
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onStatus).not.toHaveBeenCalled();
  });

  // ── When abort signal is set before model call ───────────────

  it("skips model call when abort signal is already set", async () => {
    const onStatus = vi.fn();
    mockLoadSectionConfig.mockReturnValue({ model: "anthropic/claude-sonnet-4-5" });

    // First generation with a blocking auth
    const auth1 = deferred<typeof mockAuthOk>();
    mockResolveSuggestionAuth.mockReturnValueOnce(auth1.promise);
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "should not see this" });

    generator.start(makeCtx() as never, "text one", { onStatus });
    expect(onStatus).toHaveBeenCalledWith({ kind: "generating" });

    // Start second generation which cancels first
    const auth2 = deferred<typeof mockAuthOk>();
    mockResolveSuggestionAuth.mockReturnValueOnce(auth2.promise);
    generator.start(makeCtx() as never, "text two", { onStatus });

    // Resolve first auth — the first generation's abort signal is set
    auth1.resolve(mockAuthOk);

    // model should never be called for the first generation
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockCallSuggestionModel).not.toHaveBeenCalled();

    // Now complete second generation
    auth2.resolve(mockAuthOk);
    mockCallSuggestionModel.mockResolvedValue({ ok: true, text: "second" });

    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        kind: "ready",
        suggestion: "second",
      });
    });
  });
});
