import { describe, expect, it } from "vitest";
import { normalizeQuestionnaire } from "../normalize.ts";
import type { AskUserParams } from "../schema.ts";
import { type FallbackUi, runFallbackQuestionnaire } from "../ui-fallback.ts";

interface Step {
  kind: "select" | "input";
  result: string | undefined;
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
      const numeric = Number(result);
      if (!Number.isNaN(numeric) && `${numeric}` === result) return options[numeric];
      return result;
    },
    input: async () => {
      const result = next("input");
      return result === undefined ? undefined : String(result);
    },
  };
}

describe("runFallbackQuestionnaire review + multichoice other", () => {
  it("lets the user revise from review without re-answering later questions", async () => {
    const params: AskUserParams = {
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
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?" },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: "1" },
      { kind: "select", result: "0" },
      { kind: "select", result: "1" },
      { kind: "select", result: "0" },
      { kind: "select", result: "0" },
    ]);

    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });

    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [
        { questionId: "scope", source: "option", value: "narrow", optionIndex: 0 },
        { questionId: "go", source: "yesno", value: "yes", optionIndex: 0 },
      ],
    });
  });

  it("supports multichoice allowOther as an explicit alternative path", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "multichoice",
          id: "features",
          header: "Features",
          prompt: "Pick features",
          allowOther: true,
          options: [
            { value: "preview", label: "Preview" },
            { value: "multi", label: "Multi-select" },
          ],
        },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: "0" },
      { kind: "select", result: "3" },
      { kind: "input", result: "custom bundle" },
      { kind: "select", result: "0" },
    ]);

    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });

    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "features", source: "other", value: "custom bundle" }],
    });
  });
});
