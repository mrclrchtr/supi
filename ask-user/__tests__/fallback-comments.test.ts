import { describe, expect, it } from "vitest";
import { normalizeQuestionnaire } from "../normalize.ts";
import type { AskUserParams } from "../schema.ts";
import { type FallbackUi, runFallbackQuestionnaire } from "../ui-fallback.ts";

interface Step {
  kind: "select" | "confirm" | "input";
  result: string | boolean | undefined;
}

function scriptedUi(steps: Step[]): FallbackUi {
  const queue = [...steps];
  const next = (kind: Step["kind"]): Step["result"] => {
    const step = queue.shift();
    if (!step) throw new Error(`fallback ui ran out of scripted steps when expecting ${kind}`);
    if (step.kind !== kind) throw new Error(`expected ${kind}, scripted ${step.kind}`);
    return step.result;
  };
  return {
    select: async (_title, options) => {
      const result = next("select");
      if (result === undefined) return undefined;
      if (typeof result === "string") return result;
      const idx = result as unknown as number;
      return typeof idx === "number" ? options[idx] : undefined;
    },
    confirm: async () => Boolean(next("confirm")),
    input: async () => {
      const r = next("input");
      return r === undefined ? undefined : String(r);
    },
  };
}

const choiceQuestion: AskUserParams = {
  questions: [
    {
      type: "choice",
      id: "scope",
      header: "Scope",
      prompt: "Pick scope",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "broad", label: "Broad" },
      ],
    },
  ],
};

describe("runFallbackQuestionnaire — comment prompt", () => {
  it("captures an optional comment when the user opts in", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 0 as unknown as string }, // Yes, add a note
      { kind: "input", result: "rationale here" },
    ]);
    const outcome = await runFallbackQuestionnaire(
      normalizeQuestionnaire(choiceQuestion).questions,
      { ui },
    );
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0].comment).toBe("rationale here");
  });

  it("skips the comment when the user picks 'No, skip'", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 1 as unknown as string }, // No, skip
    ]);
    const outcome = await runFallbackQuestionnaire(
      normalizeQuestionnaire(choiceQuestion).questions,
      { ui },
    );
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0].comment).toBeUndefined();
  });

  it("cancels the questionnaire when the comment Yes/No prompt is dismissed", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: undefined }, // dismissed
    ]);
    const outcome = await runFallbackQuestionnaire(
      normalizeQuestionnaire(choiceQuestion).questions,
      { ui },
    );
    expect(outcome.terminalState).toBe("cancelled");
    expect(outcome.answers).toEqual([]);
  });

  it("cancels the questionnaire when the note input is dismissed after opting in", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 0 as unknown as string }, // Yes, add a note
      { kind: "input", result: undefined }, // dismissed
    ]);
    const outcome = await runFallbackQuestionnaire(
      normalizeQuestionnaire(choiceQuestion).questions,
      { ui },
    );
    expect(outcome.terminalState).toBe("cancelled");
    expect(outcome.answers).toEqual([]);
  });
});
