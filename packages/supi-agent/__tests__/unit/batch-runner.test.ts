import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { runDelegationBatch } from "../../src/tool/batch-runner.ts";
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

function makeCatalogue(ids: string[]): ProfileCatalogue {
  return {
    profiles: ids.map((id) => ({
      id,
      source: "package" as const,
      directory: `/profiles/${id}`,
      manifest: {
        description: id,
        tools: ["read"] as const,
        systemPrompt: "native" as const,
        instructionScopes: [] as const,
      },
    })),
    diagnostics: [],
    profileIds: [...ids].sort(),
    omittedProfileCount: 0,
  };
}

describe("runDelegationBatch", () => {
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
    const catalogue: ProfileCatalogue = {
      profiles: [
        {
          id: "impl",
          source: "package" as const,
          directory: "/profiles/impl",
          manifest: {
            description: "impl",
            tools: ["edit"] as const,
            systemPrompt: "native" as const,
            instructionScopes: [] as const,
          },
        },
      ],
      diagnostics: [],
      profileIds: ["impl"],
      omittedProfileCount: 0,
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
});
