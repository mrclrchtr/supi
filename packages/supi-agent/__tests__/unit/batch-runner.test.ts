import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDelegationBatch } from "../../src/tool/agent_run/batch-runner.ts";
import type { ProfileCatalogue } from "../../src/types.ts";

// Mock startAgentRun from supi-agent-runtime
const mockHandles: Array<{
  result: Promise<{ kind: string; value?: string; usage?: object }>;
  subscribe: ReturnType<typeof vi.fn>;
  steer: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("@mrclrchtr/supi-agent-runtime/api", () => ({
  createAgentRunProviderAuthority: vi.fn(() => ({
    getProvider: () => undefined,
    getProviderAuth: async () => undefined,
  })),
  startAgentRun: vi.fn(
    (options: { prompt: string; readinessCheck?: (session: unknown) => boolean }) => {
      const handle = {
        result: new Promise<{ kind: string; value?: string }>((resolve) => {
          // Resolve immediately with success.
          resolve({ kind: "success", value: `completed: ${options.prompt}` });
        }),
        subscribe: vi.fn(() => () => undefined),
        steer: vi.fn(async () => "not-running" as const),
        stop: vi.fn(async () => undefined),
      };
      mockHandles.push(handle);
      return handle;
    },
  ),
  combineAgentRunUsage: vi.fn((usages: object[]) => {
    if (usages.length === 0) return undefined;
    return {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
  }),
}));

// Build a minimal ExtensionContext mock.
function mockCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    cwd: "/repo",
    model: { provider: "test", id: "model", name: "Test" },
    modelRegistry: {
      find: () => ({ provider: "test", id: "model", name: "Test" }),
      hasConfiguredAuth: () => true,
    },
    thinkingLevel: "medium",
    scopedModels: [],
    isProjectTrusted: () => false,
    signal: undefined,
    ui: {} as never,
    mode: "tui",
    hasUI: true,
    sessionManager: {} as never,
    abort: () => undefined,
    shutdown: () => undefined,
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => undefined,
    compact: () => undefined,
    getSystemPrompt: () => "",
    ...overrides,
  } as unknown as ExtensionContext;
}

function makeEntry(
  id: string,
  tools: readonly ["read"] | readonly ["edit"] = ["read"],
): ProfileCatalogue["profiles"][number] {
  return {
    id,
    description: id,
    sources: [
      {
        id,
        source: "package",
        directory: `/profiles/${id}`,
        manifest: {
          description: id,
          tools,
          systemPrompt: "native",
          instructionScopes: [],
        },
      },
    ],
    diagnostics: [],
  };
}

function makeCatalogue(ids: string[]): ProfileCatalogue {
  const profiles = ids.map((id) => makeEntry(id));
  return {
    profiles,
    diagnostics: [],
    profileIds: [...ids].sort(),
    omittedProfileCount: 0,
    sourceDirectories: { package: "/profiles", global: "/global" },
  };
}

describe("runDelegationBatch", () => {
  afterEach(() => resetDebugRegistry());

  it("throws on duplicate task IDs", async () => {
    const catalogue = makeCatalogue(["explore"]);
    await expect(
      runDelegationBatch(
        {
          tasks: [
            { id: "t1", profile: "explore", instructions: "x" },
            { id: "t1", profile: "explore", instructions: "y" },
          ],
        },
        catalogue,
        mockCtx(),
      ),
    ).rejects.toThrow("Duplicate task ID");
  });

  it("throws on unknown profile", async () => {
    const catalogue = makeCatalogue(["explore"]);
    await expect(
      runDelegationBatch(
        { tasks: [{ id: "t1", profile: "unknown", instructions: "x" }] },
        catalogue,
        mockCtx(),
      ),
    ).rejects.toThrow("Unknown profile");
  });

  it("rejects mutation-capable multi-task batches", async () => {
    // "edit" is mutation-capable
    const profiles = [makeEntry("impl", ["edit"])] as const;
    const catalogue: ProfileCatalogue = {
      profiles,
      diagnostics: [],
      profileIds: ["impl"],
      omittedProfileCount: 0,
      sourceDirectories: { package: "/profiles", global: "/global" },
    };
    await expect(
      runDelegationBatch(
        {
          tasks: [
            { id: "t1", profile: "impl", instructions: "x" },
            { id: "t2", profile: "impl", instructions: "y" },
          ],
        },
        catalogue,
        mockCtx(),
      ),
    ).rejects.toThrow("Mutation-capable");
  });

  it("runs a read-only single-task batch and returns results", async () => {
    const catalogue = makeCatalogue(["explore"]);
    const { modelText, results } = await runDelegationBatch(
      { tasks: [{ id: "t1", profile: "explore", instructions: "do work" }] },
      catalogue,
      mockCtx(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe("t1");
    expect(results[0].status).toBe("completed");
    expect(results[0].finalText).toContain("completed:");
    expect(modelText).toContain("## t1 (profile: explore) — completed");
  });

  it("records timing telemetry for a successful task", async () => {
    configureDebugRegistry({ enabled: true });

    await runDelegationBatch(
      { tasks: [{ id: "t1", profile: "explore", instructions: "do work" }] },
      makeCatalogue(["explore"]),
      mockCtx(),
    );

    expect(getDebugEvents({ source: "supi-agent", category: "agent-run" }).events).toEqual([
      expect.objectContaining({
        level: "info",
        message: "Agent Run t1 completed",
        data: expect.objectContaining({
          taskId: "t1",
          status: "completed",
          turns: 0,
          toolUses: 0,
          timing: expect.objectContaining({
            elapsedMs: expect.any(Number),
            incompleteToolCount: 0,
            tools: [],
          }),
        }),
      }),
    ]);
  });

  it("runs a read-only multi-task batch concurrently", async () => {
    const catalogue = makeCatalogue(["explore"]);
    // Both "explore" profile: read-only.
    const { results } = await runDelegationBatch(
      {
        tasks: [
          { id: "t1", profile: "explore", instructions: "a" },
          { id: "t2", profile: "explore", instructions: "b" },
        ],
      },
      catalogue,
      mockCtx(),
    );
    expect(results).toHaveLength(2);
    // Output order matches input order.
    expect(results[0].taskId).toBe("t1");
    expect(results[1].taskId).toBe("t2");
    expect(results.every((result) => result.status === "completed")).toBe(true);
  });

  it("returns a normal result even when every task fails", async () => {
    // Mock startAgentRun to return failure for this test only.
    const { startAgentRun } = await import("@mrclrchtr/supi-agent-runtime/api");
    (startAgentRun as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      result: Promise.resolve({
        kind: "failed",
        failureCode: "session-not-ready",
        diagnostics: {},
      }),
      subscribe: vi.fn(() => () => undefined),
      steer: vi.fn(async () => "not-running" as const),
      stop: vi.fn(async () => undefined),
    }));

    const catalogue = makeCatalogue(["explore"]);
    const { results, modelText } = await runDelegationBatch(
      { tasks: [{ id: "t1", profile: "explore", instructions: "fail" }] },
      catalogue,
      mockCtx(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
    expect(modelText).toContain("failed");
    // Should not throw — returns normal result.
  });

  it("records bounded Agent Run diagnostics for a failed task", async () => {
    configureDebugRegistry({ enabled: true });
    const { startAgentRun } = await import("@mrclrchtr/supi-agent-runtime/api");
    (startAgentRun as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      result: Promise.resolve({
        kind: "failed",
        failureCode: "missing-completion",
        diagnostics: {
          lifecycleTrace: {
            entries: [
              { type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1_000 },
              {
                type: "auto_retry_end",
                success: false,
                attempt: 1,
                hasFinalError: true,
                finalErrorText: "provider rate-limit error",
              },
            ],
            droppedCount: 0,
          },
          turns: 1,
          toolUses: 0,
          lastAssistantStopReason: "error",
          lastLifecycleErrorText: "provider rate-limit error",
        },
      }),
      subscribe: vi.fn(() => () => undefined),
      steer: vi.fn(async () => "not-running" as const),
      stop: vi.fn(async () => undefined),
    }));

    await runDelegationBatch(
      { tasks: [{ id: "t1", profile: "explore", instructions: "finish" }] },
      makeCatalogue(["explore"]),
      mockCtx(),
    );

    expect(getDebugEvents({ source: "supi-agent", category: "agent-run" }).events).toEqual([
      expect.objectContaining({
        level: "warning",
        message: "Agent Run t1 failed",
        data: expect.objectContaining({
          taskId: "t1",
          profileId: "explore",
          modelId: "test/model",
          status: "failed",
          failureCode: "missing-completion",
          diagnostics: expect.objectContaining({
            lastAssistantStopReason: "error",
            lastLifecycleErrorText: "provider rate-limit error",
          }),
        }),
      }),
    ]);
  });

  it("bounds four 16,000-character answers to one aggregate result with a complete spill", async () => {
    const { startAgentRun } = await import("@mrclrchtr/supi-agent-runtime/api");
    const bigAnswer = "x".repeat(16_000);
    for (let i = 0; i < 4; i++) {
      (startAgentRun as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        result: Promise.resolve({ kind: "success" as const, value: bigAnswer }),
        subscribe: vi.fn(() => () => undefined),
        steer: vi.fn(async () => "not-running" as const),
        stop: vi.fn(async () => undefined),
      }));
    }

    const { modelText, fullOutputPath, results } = await runDelegationBatch(
      {
        tasks: [
          { id: "t1", profile: "explore", instructions: "a" },
          { id: "t2", profile: "explore", instructions: "b" },
          { id: "t3", profile: "explore", instructions: "c" },
          { id: "t4", profile: "explore", instructions: "d" },
        ],
      },
      makeCatalogue(["explore"]),
      mockCtx(),
    );

    expect(results).toHaveLength(4);
    expect(results.every((result) => result.status === "completed")).toBe(true);
    // One bounded aggregate result, still under the byte bound.
    expect(Buffer.byteLength(modelText, "utf-8")).toBeLessThanOrEqual(51_200 + 120);
    // Every task stays represented.
    for (let i = 1; i <= 4; i++) {
      expect(modelText).toContain(`## t${i} (profile: explore) — completed`);
    }
    expect(modelText).toContain("[truncated: 16,000 total characters]");

    // The complete joined per-task Markdown is spilled to a temporary file.
    expect(fullOutputPath).toBeDefined();
    expect(fullOutputPath).toMatch(/supi-agent-/);
    const { readFileSync } = await import("node:fs");
    const spill = readFileSync(fullOutputPath!, "utf-8");
    expect(Buffer.byteLength(spill, "utf-8")).toBeGreaterThan(51_200);
    for (let i = 1; i <= 4; i++) {
      expect(spill).toContain(`## t${i} (profile: explore) — completed`);
    }
  });

  it("preserves missing assistant text as missing completion", async () => {
    const { startAgentRun } = await import("@mrclrchtr/supi-agent-runtime/api");
    (startAgentRun as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (options: { completionResolver: (session: unknown) => string | undefined }) => ({
        result: Promise.resolve(
          options.completionResolver({ getLastAssistantText: () => undefined }),
        ).then((value) =>
          value === undefined
            ? {
                kind: "failed" as const,
                failureCode: "missing-completion" as const,
                diagnostics: {},
              }
            : { kind: "success" as const, value },
        ),
        subscribe: vi.fn(() => () => undefined),
        steer: vi.fn(async () => "not-running" as const),
        stop: vi.fn(async () => undefined),
      }),
    );

    const { results } = await runDelegationBatch(
      { tasks: [{ id: "t1", profile: "explore", instructions: "finish" }] },
      makeCatalogue(["explore"]),
      mockCtx(),
    );

    expect(results[0]).toMatchObject({
      status: "failed",
      failureCode: "missing-completion",
    });
  });
});
