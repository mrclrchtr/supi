import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runIsolatedChild: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", async (original) => ({
  ...(await original()),
  clampThinkingLevel: () => "low",
}));
vi.mock("../../src/tool/child-session-runner.ts", () => ({
  runIsolatedChild: mocks.runIsolatedChild,
}));

import {
  buildPlannerSystemPrompt,
  PLANNER_PROMPT_VERSION,
  runPlanner,
} from "../../src/tool/planner-runner.ts";

const args = { cwd: "/repo", prompt: "bounded input", model: {} as never };
const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 0, toolUses: 0 };

describe("runPlanner", () => {
  it("constrains drafts to the reviewers' static target-aware capabilities", () => {
    const prompt = buildPlannerSystemPrompt();

    expect(PLANNER_PROMPT_VERSION).toBe("4");
    expect(prompt).toContain("code_orientation");
    expect(prompt).toContain("read, bash, grep");
    expect(prompt).toMatch(/Current-State Audit.*omit findingScope.*criteria-only/is);
    expect(prompt).toMatch(/Git-change target.*findingScope.*change-only.*boy-scout/is);
    expect(prompt).not.toContain("concrete regressions introduced");
    expect(prompt).toContain("Do not request tests, builds, linters");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runIsolatedChild.mockResolvedValue({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
  });

  it("rejects semantically invalid Planner Drafts before accepting submission", async () => {
    await runPlanner(args);

    const config = mocks.runIsolatedChild.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<unknown> }>;
    };
    const submit = config.customTools?.[0];
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
    await runPlanner(args);

    const config = mocks.runIsolatedChild.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<{ details?: unknown }> }>;
    };
    const result = await config.customTools?.[0]?.execute("call", {
      tasks: [{ id: "scope", instructions: "Review.", findingScope: "boy-scout" }],
    });

    expect(result?.details).toEqual({
      tasks: [{ id: "scope", instructions: "Review.", findingScope: "boy-scout" }],
    });
  });

  it("passes the submit tool, isolated prompt, and five-minute timeout to the runtime adapter", async () => {
    await runPlanner(args);

    expect(mocks.runIsolatedChild).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "bounded input",
        timeoutMs: 5 * 60 * 1_000,
        tools: ["submit_review_plan"],
      }),
    );
  });

  it("preserves runtime outcomes, including diagnostics-free session creation failure", async () => {
    const draft = { tasks: [{ id: "t", instructions: "Review." }] };
    mocks.runIsolatedChild.mockResolvedValueOnce({ kind: "success", value: draft });
    await expect(runPlanner(args)).resolves.toEqual({ kind: "success", value: draft });

    mocks.runIsolatedChild.mockResolvedValueOnce({
      kind: "failed",
      failureCode: "missing-structured-output",
      diagnostics,
    });
    await expect(runPlanner(args)).resolves.toEqual({
      kind: "failed",
      failureCode: "missing-structured-output",
      diagnostics,
    });

    mocks.runIsolatedChild.mockResolvedValueOnce({ kind: "canceled", diagnostics });
    await expect(runPlanner(args)).resolves.toEqual({ kind: "canceled", diagnostics });

    mocks.runIsolatedChild.mockResolvedValueOnce({
      kind: "failed",
      failureCode: "prompt-rejected",
      diagnostics,
    });
    await expect(runPlanner(args)).resolves.toEqual({
      kind: "failed",
      failureCode: "prompt-rejected",
      diagnostics,
    });

    mocks.runIsolatedChild.mockResolvedValueOnce({
      kind: "timeout",
      timeoutMs: 1234,
      diagnostics,
    });
    await expect(runPlanner(args)).resolves.toEqual({
      kind: "timeout",
      timeoutMs: 1234,
      diagnostics,
    });

    mocks.runIsolatedChild.mockResolvedValueOnce({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
    await expect(runPlanner(args)).resolves.toEqual({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
  });
});
