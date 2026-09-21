import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSuggestionWarning, formatSuggestionWarning } from "../../src/generation/failure.ts";
import { type GenerationStatus, SuggestionGenerator } from "../../src/generation/generator.ts";
import { SessionLifecycle } from "../../src/session.ts";

// biome-ignore lint/security/noSecrets: This is a provider error type, not a credential.
const GO_USAGE_LIMIT_ERROR = "GoUsageLimitError";

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

const tempDirectories: string[] = [];

function makeResponse(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "next" }],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeFixture(response: AssistantMessage | Promise<AssistantMessage>) {
  const cwd = mkdtempSync(join(tmpdir(), "supi-prompt-generator-"));
  tempDirectories.push(cwd);
  mkdirSync(join(cwd, ".pi", "supi"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    `${JSON.stringify({ enabledModels: ["test-provider/suggestion-model"] }, null, 2)}\n`,
  );
  writeFileSync(
    join(cwd, ".pi", "supi", "config.json"),
    `${JSON.stringify({ promptSuggestions: { model: "test-provider/suggestion-model" } }, null, 2)}\n`,
  );

  const complete = vi.fn().mockReturnValue(response);
  const base = makeCtx();
  const ctx = makeCtx({
    cwd,
    hasUI: true,
    ui: { ...base.ui, setEditorComponent: vi.fn() },
    model: MODEL,
    modelRegistry: {
      getAvailable: () => [MODEL],
      streamSimple: (...args: unknown[]) => ({ result: () => complete(...args) }),
    },
    sessionManager: {
      getSessionId: () => "pi-session",
      getBranch: () => [{ type: "message", message: makeResponse() }],
    },
  }) as unknown as ExtensionContext;
  return { ctx, complete };
}

async function waitForError(
  statuses: GenerationStatus[],
): Promise<Extract<GenerationStatus, { kind: "error" }>> {
  await vi.waitFor(() => {
    expect(statuses.some((status) => status.kind === "error")).toBe(true);
  });
  const status = [...statuses].reverse().find((candidate) => candidate.kind === "error");
  if (status?.kind !== "error") throw new Error("Missing error status");
  return status;
}

afterEach(() => {
  vi.useRealTimers();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SuggestionGenerator warning policy", () => {
  it("bounds and sanitizes the notification label", () => {
    const warning = createSuggestionWarning(`${"provider".repeat(20)}/model\nsecret`, "request");
    const message = formatSuggestionWarning(warning);

    expect(message).not.toContain("\n");
    expect(message).not.toContain("\r");
    expect(message.length).toBeLessThan(200);
  });

  it("uses runtime auth errors, warns once, and keeps provider details out of the warning", async () => {
    const secret = "sk-live-provider-secret";
    const { ctx, complete } = makeFixture(
      Promise.resolve(
        makeResponse({
          content: [],
          stopReason: "error",
          errorMessage: `No API key found for test-provider (${secret})`,
        }),
      ),
    );
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    const callbacks = { onStatus: (status: GenerationStatus) => statuses.push(status) };

    generator.start(ctx, "assistant text", callbacks);
    const first = await waitForError(statuses);
    expect(first).toMatchObject({
      kind: "error",
      warning: {
        kind: "authentication",
        model: "test-provider/suggestion-model",
        summary: "authentication failed",
      },
    });
    expect(JSON.stringify(first)).not.toContain(secret);
    expect(complete).toHaveBeenCalledOnce();

    statuses.length = 0;
    generator.start(ctx, "assistant text", callbacks);
    const second = await waitForError(statuses);
    expect(second).toEqual({ kind: "error" });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "billing 401",
      errorMessage: '401 {"error":{"type":"BillingError","message":"account access denied"}}',
      summary: "billing failed",
      kind: "billing",
      httpStatus: 401,
    },
    {
      name: "billing 429",
      errorMessage: '429 {"error":{"code":"billing_required","message":"account access denied"}}',
      summary: "billing failed",
      kind: "billing",
      httpStatus: 429,
    },
    {
      name: "quota",
      errorMessage: `429 {"error":{"type":"${GO_USAGE_LIMIT_ERROR}","message":"available balance"}}`,
      summary: "quota exceeded",
      kind: "quota",
      httpStatus: 429,
    },
    {
      name: "generic 429",
      errorMessage: '429 {"error":{"message":"too many requests"}}',
      summary: "rate limit exceeded",
      kind: "rate-limit",
      httpStatus: 429,
    },
    {
      name: "plain auth",
      errorMessage: '401 {"error":{"message":"invalid api key"}}',
      summary: "authentication failed",
      kind: "authentication",
      httpStatus: 401,
    },
  ])(
    "carries $name metadata through the generator and UI",
    async ({ errorMessage, summary, httpStatus }) => {
      const { ctx } = makeFixture(
        Promise.resolve(makeResponse({ content: [], stopReason: "error", errorMessage })),
      );
      const lifecycle = new SessionLifecycle(new SuggestionGenerator());
      lifecycle.onStart(ctx);
      lifecycle.onAgentSettled(ctx);

      await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledOnce());

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        `Prompt suggestion unavailable for test-provider/suggestion-model: ${summary} (HTTP ${httpStatus})`,
        "warning",
      );
      lifecycle.onShutdown();
    },
  );

  it("resets failure suppression after a valid empty response", async () => {
    const { ctx, complete } = makeFixture(
      Promise.resolve(
        makeResponse({
          content: [],
          stopReason: "error",
          errorMessage: "provider request failed",
        }),
      ),
    );
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    const callbacks = { onStatus: (status: GenerationStatus) => statuses.push(status) };

    generator.start(ctx, "assistant text", callbacks);
    await waitForError(statuses);

    complete.mockResolvedValueOnce(makeResponse({ content: [], stopReason: "stop" }));
    statuses.length = 0;
    generator.start(ctx, "assistant text", callbacks);
    await vi.waitFor(() => expect(statuses).toContainEqual({ kind: "idle" }));

    complete.mockResolvedValueOnce(
      makeResponse({ content: [], stopReason: "error", errorMessage: "provider request failed" }),
    );
    statuses.length = 0;
    generator.start(ctx, "assistant text", callbacks);
    const third = await waitForError(statuses);
    expect(third).toHaveProperty("warning");
  });

  it("clears suppression when disabled and enabled through a configuration file", async () => {
    const { ctx } = makeFixture(
      makeResponse({ stopReason: "error", errorMessage: "provider failure" }),
    );
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    const callbacks = { onStatus: (status: GenerationStatus) => statuses.push(status) };
    generator.start(ctx, "assistant text", callbacks);
    expect(await waitForError(statuses)).toHaveProperty("warning");

    const configPath = join(ctx.cwd, ".pi", "supi", "config.json");
    writeFileSync(configPath, JSON.stringify({ promptSuggestions: { model: "disabled" } }));
    generator.start(ctx, "assistant text", callbacks);
    writeFileSync(
      configPath,
      JSON.stringify({ promptSuggestions: { model: "test-provider/suggestion-model" } }),
    );
    statuses.length = 0;
    generator.start(ctx, "assistant text", callbacks);
    expect(await waitForError(statuses)).toHaveProperty("warning");
  });

  it("shows a new warning after settings persistence and session restart", async () => {
    const { ctx, complete } = makeFixture(
      makeResponse({ stopReason: "error", errorMessage: "provider failure" }),
    );
    const lifecycle = new SessionLifecycle(new SuggestionGenerator());
    lifecycle.onStart(ctx);
    lifecycle.onAgentSettled(ctx);
    await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledOnce());
    lifecycle.onAgentSettled(ctx);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("supi-prompt-suggestions", ""),
    );
    expect(ctx.ui.notify).toHaveBeenCalledOnce();

    lifecycle.onSettingsChanged();
    lifecycle.onAgentSettled(ctx);
    await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledTimes(2));
    lifecycle.onStart(ctx);
    lifecycle.onAgentSettled(ctx);
    await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledTimes(3));
    lifecycle.onShutdown();
  });

  it("keeps a synchronous provider abort response quiet after cancellation", async () => {
    const { ctx, complete } = makeFixture(makeResponse());
    complete.mockImplementation((_model, _context, options) => {
      return new Promise<AssistantMessage>((resolve) => {
        options.signal.addEventListener("abort", () => {
          resolve(makeResponse({ stopReason: "aborted", content: [] }));
        });
      });
    });
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];
    generator.start(ctx, "assistant text", { onStatus: (status) => statuses.push(status) });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    statuses.length = 0;
    generator.dismiss();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(statuses).toEqual([]);
  });

  it("warns and settles when a provider ignores the timeout abort", async () => {
    vi.useFakeTimers();
    const never = new Promise<AssistantMessage>(() => {});
    const { ctx, complete } = makeFixture(never);
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(ctx, "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    statuses.length = 0;

    await vi.advanceTimersByTimeAsync(20_000);

    const timeout = await waitForError(statuses);
    expect(timeout).toMatchObject({
      kind: "error",
      warning: {
        kind: "timeout",
        model: "test-provider/suggestion-model",
        summary: "request timed out",
      },
    });
  });

  it("keeps normal cancellation quiet even when the provider ignores abort", async () => {
    vi.useFakeTimers();
    const never = new Promise<AssistantMessage>(() => {});
    const { ctx, complete } = makeFixture(never);
    const generator = new SuggestionGenerator();
    const statuses: GenerationStatus[] = [];

    generator.start(ctx, "assistant text", {
      onStatus: (status) => statuses.push(status),
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    statuses.length = 0;
    generator.dismiss();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(statuses).toEqual([]);
  });
});
