import { Value } from "typebox/value";
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

import { runPlanner } from "../../src/tool/planner-runner.ts";

const args = { cwd: "/repo", prompt: "bounded input", model: {} as never };
const diagnostics = { lifecycleTrace: { entries: [], droppedCount: 0 }, turns: 0, toolUses: 0 };

describe("runPlanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runIsolatedChild.mockResolvedValue({
      kind: "failed",
      failureCode: "session-creation-failed",
    });
  });

  it("rejects invalid Planner Drafts before accepting submission", async () => {
    await runPlanner(args);

    const config = mocks.runIsolatedChild.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<unknown> }>;
    };
    const submit = config.customTools?.[0];
    expect(submit).toBeDefined();
    await expect(
      submit?.execute("call", { tasks: [{ id: " ", instructions: " " }] }),
    ).rejects.toThrow("Invalid Planner Draft.");
    await expect(
      submit?.execute("call", {
        tasks: [{ id: "scope", instructions: "Review.", mode: "repository-wide" }],
      }),
    ).rejects.toThrow("Invalid Planner Draft.");
  });

  it("rejects caller-only criteria sources in the Planner Draft tool schema", async () => {
    await runPlanner(args);

    const config = mocks.runIsolatedChild.mock.calls[0]?.[0] as {
      customTools?: Array<{
        execute: (...args: unknown[]) => Promise<unknown>;
        parameters?: unknown;
      }>;
    };
    const submit = config.customTools?.[0];
    const draft = {
      tasks: [
        {
          id: "spec",
          instructions: "Review the specification.",
          mode: "state",
          criteriaSources: [{ reference: "#291", summary: "Acceptance criteria." }],
        },
      ],
    };

    expect(Value.Check(submit?.parameters as never, draft)).toBe(false);
    await expect(submit?.execute("call", draft)).rejects.toThrow("Invalid Planner Draft.");
  });

  it("preserves a valid Review Mode through Planner Draft normalization", async () => {
    await runPlanner(args);

    const config = mocks.runIsolatedChild.mock.calls[0]?.[0] as {
      customTools?: Array<{ execute: (...args: unknown[]) => Promise<{ details?: unknown }> }>;
    };
    const result = await config.customTools?.[0]?.execute("call", {
      tasks: [{ id: "scope", instructions: "Review.", mode: "state" }],
    });

    expect(result?.details).toEqual({
      tasks: [{ id: "scope", instructions: "Review.", mode: "state" }],
    });
  });

  it("passes the submit tool, isolated prompt, and five-minute timeout to the runtime adapter", async () => {
    await runPlanner(args);

    expect(mocks.runIsolatedChild).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "bounded input",
        timeoutMs: 5 * 60 * 1_000,
        tools: ["submit_planner_draft"],
      }),
    );
  });

  it("preserves runtime outcomes, including diagnostics-free session creation failure", async () => {
    const draft = { tasks: [{ id: "t", instructions: "Review.", mode: "change" as const }] };
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
