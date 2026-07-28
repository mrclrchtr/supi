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

import { buildPlannerSystemPrompt, runPlanner } from "../../src/tool/planner-runner.ts";

describe("runPlanner", () => {
  it("constrains drafts to the reviewers' static target-aware capabilities", () => {
    const prompt = buildPlannerSystemPrompt();

    expect(prompt).toContain("read_review_diff");
    expect(prompt).toContain("cannot run shell commands");
    expect(prompt).toContain("introduced by the selected change");
    expect(prompt).toContain("Do not request runtime experiments");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reload.mockResolvedValue(undefined);
    mocks.createAgentSession.mockResolvedValue({ session: {} });
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
