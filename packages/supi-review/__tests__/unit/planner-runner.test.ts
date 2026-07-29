import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  reload: vi.fn(),
  runWithLifecycle: vi.fn(),
  settingsManager: { marker: "isolated" },
}));
vi.mock("@earendil-works/pi-ai", async (original) => ({
  ...(await original()),
  clampThinkingLevel: () => "low",
}));
vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original()),
  createAgentSession: mocks.createAgentSession,
}));
vi.mock("../../src/tool/child-resource-loader.ts", () => ({
  createIsolatedChildResources: () => ({
    loader: { reload: mocks.reload },
    settingsManager: mocks.settingsManager,
  }),
}));
vi.mock("../../src/tool/session-lifecycle.ts", () => ({
  runWithLifecycle: mocks.runWithLifecycle,
}));

import {
  buildPlannerSystemPrompt,
  PLANNER_PROMPT_VERSION,
  runPlanner,
} from "../../src/tool/planner-runner.ts";

describe("runPlanner", () => {
  it("constrains drafts to the reviewers' static target-aware capabilities", () => {
    const prompt = buildPlannerSystemPrompt();

    expect(PLANNER_PROMPT_VERSION).toBe("3");
    expect(prompt).toContain("code_orientation");
    expect(prompt).toContain("read, bash, grep");
    expect(prompt).toMatch(/findingScope.*change-only.*boy-scout/is);
    expect(prompt).not.toContain("concrete regressions introduced");
    expect(prompt).toContain("Do not request tests, builds, linters");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reload.mockResolvedValue(undefined);
    mocks.createAgentSession.mockResolvedValue({
      session: { bindExtensions: vi.fn() },
      extensionsResult: { errors: [] },
    });
    mocks.runWithLifecycle.mockResolvedValue({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
  });

  it("rejects semantically invalid Planner Drafts before accepting submission", async () => {
    await runPlanner({ cwd: "/repo", prompt: "bounded input", model: {} as never });

    const options = mocks.createAgentSession.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<unknown> }>;
    };
    const submit = options.customTools?.[0];
    expect(submit).toBeDefined();
    await expect(
      submit?.execute("call", { tasks: [{ id: " ", instructions: " " }] }),
    ).rejects.toThrow(/blank/i);
    await expect(
      submit?.execute("call", {
        tasks: [{ id: "scope", instructions: "Review.", findingScope: "repository-wide" }],
      }),
    ).rejects.toThrow(/findingScope/i);
  });

  it("preserves a valid Finding Scope through Planner Draft normalization", async () => {
    await runPlanner({ cwd: "/repo", prompt: "bounded input", model: {} as never });

    const options = mocks.createAgentSession.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<{ details?: unknown }> }>;
    };
    const result = await options.customTools?.[0]?.execute("call", {
      tasks: [{ id: "scope", instructions: "Review.", findingScope: "boy-scout" }],
    });

    expect(result?.details).toEqual({
      tasks: [{ id: "scope", instructions: "Review.", findingScope: "boy-scout" }],
    });
  });

  it("has only its submit tool, isolated settings, and a five-minute timeout", async () => {
    await runPlanner({ cwd: "/repo", prompt: "bounded input", model: {} as never });

    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsManager: mocks.settingsManager,
        tools: ["submit_review_plan"],
      }),
    );
    expect(mocks.runWithLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "bounded input", timeoutMs: 5 * 60 * 1_000 }),
    );
  });
});
