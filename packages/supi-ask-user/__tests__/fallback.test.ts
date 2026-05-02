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

const choiceParams: AskUserParams = {
  questions: [
    {
      type: "choice",
      id: "scope",
      header: "Scope",
      prompt: "Pick scope",
      allowOther: true,
      allowDiscuss: true,
      options: [
        { value: "narrow", label: "Narrow", description: "limit to api/" },
        { value: "broad", label: "Broad", description: "entire repo" },
      ],
    },
  ],
};

describe("runFallbackQuestionnaire", () => {
  it("submits when the user selects a single choice option", async () => {
    const ui = scriptedUi([{ kind: "select", result: "0" }]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams), {
      ui,
    });
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", value: "narrow", optionIndex: 0 }],
    });
  });

  it("captures Other freeform input as a separate source", async () => {
    const ui = scriptedUi([
      { kind: "select", result: "2" },
      { kind: "input", result: "scope to api/" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams), {
      ui,
    });
    expect(outcome.answers[0]).toMatchObject({ source: "other", value: "scope to api/" });
  });

  it("captures discuss as a successful outcome instead of a cancellation", async () => {
    const ui = scriptedUi([
      { kind: "select", result: "3" },
      { kind: "input", result: "need to compare risks first" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams), {
      ui,
    });
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ source: "discuss", value: "need to compare risks first" }],
    });
  });

  it("supports multichoice toggle and submit", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "multichoice",
          id: "features",
          header: "Features",
          prompt: "Pick features",
          allowDiscuss: true,
          options: [
            { value: "preview", label: "Preview" },
            { value: "multi", label: "Multi-select" },
            { value: "discuss", label: "Discuss" },
          ],
        },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: "0" },
      { kind: "select", result: "1" },
      { kind: "select", result: "3" },
      { kind: "select", result: "Submit answers" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [
        {
          source: "options",
          values: ["preview", "multi"],
          optionIndexes: [0, 1],
          selections: [
            { value: "preview", optionIndex: 0 },
            { value: "multi", optionIndex: 1 },
          ],
        },
      ],
    });
  });

  it("walks through a multi-question questionnaire, reviews, and submits", async () => {
    const params: AskUserParams = {
      questions: [
        choiceParams.questions[0],
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?", allowDiscuss: true },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: "1" },
      { kind: "select", result: "0" },
      { kind: "select", result: "Submit answers" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });
    expect(outcome.answers.map((answer) => answer.questionId)).toEqual(["scope", "go"]);
    expect(outcome.terminalState).toBe("submitted");
  });

  it("rejects empty text submissions and re-prompts until non-empty", async () => {
    const ui = scriptedUi([
      { kind: "input", result: "   " },
      { kind: "input", result: "" },
      { kind: "input", result: "actual answer" },
    ]);
    const params: AskUserParams = {
      questions: [{ type: "text", id: "name", header: "Name", prompt: "Name?" }],
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });
    expect(outcome.answers[0]).toMatchObject({ source: "text", value: "actual answer" });
  });

  it("treats undefined select return as cancellation", async () => {
    const ui = scriptedUi([{ kind: "select", result: undefined }]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams), {
      ui,
    });
    expect(outcome).toMatchObject({ terminalState: "cancelled", answers: [] });
  });

  it("treats signal.aborted between dialogs as aborted terminal state", async () => {
    const controller = new AbortController();
    const ui: FallbackUi = {
      select: async () => {
        controller.abort();
        return undefined;
      },
      input: async () => undefined,
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams), {
      ui,
      signal: controller.signal,
    });
    expect(outcome.terminalState).toBe("aborted");
  });

  it("allows skipping an optional text question with empty input", async () => {
    const ui = scriptedUi([{ kind: "input", result: "" }]);
    const params: AskUserParams = {
      questions: [{ type: "text", id: "note", header: "Note", prompt: "Note?", required: false }],
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0]).toMatchObject({ source: "text", value: "" });
  });

  it("shows skip action in review when allowSkip is true", async () => {
    const params: AskUserParams = {
      questions: [
        choiceParams.questions[0],
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?" },
      ],
      allowSkip: true,
    };
    const ui = scriptedUi([
      { kind: "select", result: "1" },
      { kind: "select", result: "0" },
      { kind: "select", result: "Skip questionnaire" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params), {
      ui,
    });
    expect(outcome.terminalState).toBe("skipped");
    expect(outcome.answers).toEqual([
      { questionId: "scope", source: "option", value: "broad", optionIndex: 1 },
      { questionId: "go", source: "yesno", value: "yes", optionIndex: 0 },
    ]);
  });
});
