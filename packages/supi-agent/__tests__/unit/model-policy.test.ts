import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentModelContext, AgentProfile } from "../../src/api.ts";
import { resolveAgentProfile } from "../../src/api.ts";

const temporaryDirectories: string[] = [];
const providerAuthority = {
  getProvider: () => undefined,
  getProviderAuth: async () => undefined,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function profileDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "supi-agent-model-"));
  temporaryDirectories.push(directory);
  return directory;
}

interface TestModel {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly reasoning: boolean;
  readonly input: readonly string[];
  readonly cost: {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
  };
  readonly contextWindow: number;
  readonly maxTokens: number;
}

function model(provider: string, id: string, reasoning = false): TestModel {
  return {
    provider,
    id,
    name: id,
    reasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 4_000,
  };
}

function profile(manifest: AgentProfile["manifest"]): AgentProfile {
  return {
    id: "test",
    source: "package",
    directory: "/profiles/test",
    manifest,
  };
}

function context(
  currentModel: ReturnType<typeof model>,
  overrides: Partial<AgentModelContext> = {},
): AgentModelContext {
  return {
    currentModel,
    providerAuthority,
    currentThinkingLevel: "high",
    scopedModels: [],
    modelRegistry: {
      find: (provider: string, id: string) =>
        provider === currentModel.provider && id === currentModel.id ? currentModel : undefined,
      hasConfiguredAuth: () => true,
    },
    ...overrides,
  } as unknown as AgentModelContext;
}

describe("resolveAgentProfile", () => {
  it("inherits the current model, clamps thinking, and builds in-memory inputs", async () => {
    const cwd = await profileDirectory();
    const current = model("openai", "gpt-5");
    const result = resolveAgentProfile(
      profile({
        description: "test",
        tools: ["read"],
        systemPrompt: "native",
        instructionScopes: [],
        timeoutMinutes: 2,
      }),
      context(current),
      { cwd, agentDir: cwd, projectTrusted: false, providerAuthority },
    );

    expect(result).toMatchObject({
      model: { provider: "openai", id: "gpt-5" },
      thinkingLevel: "off",
      timeoutMs: 120_000,
    });
    if (!("inputs" in result)) throw new Error("expected a resolved profile");
    expect(result.inputs.tools).toEqual(["read"]);
    expect(result.inputs.settingsManager.getCompactionEnabled()).toBe(true);
    expect(result.inputs.settingsManager.getRetryEnabled()).toBe(true);
  });

  it("bounds model-policy diagnostics even for direct callers", async () => {
    const cwd = await profileDirectory();
    const result = resolveAgentProfile(
      profile({
        description: "test",
        tools: [],
        systemPrompt: "native",
        instructionScopes: [],
        model: `openai/${"x".repeat(1_000)}`,
      }),
      context(model("openai", "gpt-5")),
      { cwd, agentDir: cwd, projectTrusted: false, providerAuthority },
    );

    expect("message" in result ? result.message.length : 0).toBeLessThanOrEqual(240);
  });

  it("requires explicit models to be authenticated and inside the parent scope", async () => {
    const cwd = await profileDirectory();
    const current = model("openai", "gpt-5");
    const configured = model("anthropic", "claude-sonnet");
    const selected = profile({
      description: "test",
      tools: [],
      systemPrompt: "native",
      instructionScopes: [],
      model: "anthropic/claude-sonnet",
    });
    const base = context(current, {
      modelRegistry: {
        find: () => configured as never,
        hasConfiguredAuth: () => true,
      },
      scopedModels: [{ model: current as never }],
    });

    expect(
      resolveAgentProfile(selected, base, {
        cwd,
        agentDir: cwd,
        projectTrusted: false,
        providerAuthority,
      }),
    ).toMatchObject({
      code: "model-out-of-scope",
    });
    expect(
      resolveAgentProfile(
        selected,
        {
          ...base,
          scopedModels: [],
          modelRegistry: {
            find: () => configured as never,
            hasConfiguredAuth: () => false,
          },
        },
        { cwd, agentDir: cwd, projectTrusted: false, providerAuthority },
      ),
    ).toMatchObject({ code: "model-unauthenticated" });
  });
});
