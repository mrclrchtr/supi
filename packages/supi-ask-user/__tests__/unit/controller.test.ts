import { describe, expect, it } from "vitest";
import { AskUserController } from "../../src/session/controller.ts";
import type { NormalizedChoiceQuestion, NormalizedQuestionnaire } from "../../src/types.ts";

const questionnaire: NormalizedQuestionnaire = {
  title: "Formatter",
  intro: "Need one explicit choice.",
  allowPartialSubmit: true,
  allowDiscuss: true,
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Which formatter?",
      required: true,
      options: [
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
      ],
      multi: false,
      allowOther: true,
      recommendedIndexes: [0],
      initialIndexes: [],
    },
    {
      type: "text",
      id: "reason",
      header: "Reason",
      prompt: "Anything else?",
      required: false,
      placeholder: "optional",
    },
  ],
};

const multiQuestionnaire: NormalizedQuestionnaire = {
  title: "Checks",
  intro: "Pick all required checks.",
  allowPartialSubmit: false,
  allowDiscuss: false,
  questions: [
    {
      type: "choice",
      id: "checks",
      header: "Checks",
      prompt: "Which checks should run?",
      required: true,
      options: [
        { value: "lint", label: "Lint" },
        { value: "tests", label: "Tests" },
      ],
      multi: true,
      allowOther: false,
      recommendedIndexes: [],
      initialIndexes: [],
    },
  ],
};

const formatterQuestion = questionnaire.questions[0] as NormalizedChoiceQuestion;
const checksQuestion = multiQuestionnaire.questions[0] as NormalizedChoiceQuestion;

describe("AskUserController", () => {
  it("submits when all required questions are answered", () => {
    const controller = new AskUserController(questionnaire);
    controller.setAnswer("formatter", {
      kind: "choice",
      selections: [{ value: "biome", label: "Biome" }],
    });

    expect(controller.canSubmit()).toBe(true);
    expect(controller.finishSubmitted()).toBe(true);
    expect(controller.outcome()).toMatchObject({
      status: "submitted",
      missingQuestionIds: [],
      answersById: {
        formatter: { kind: "choice", selections: [{ value: "biome", label: "Biome" }] },
      },
    });
  });

  it("supports partial submit when required answers are still missing", () => {
    const controller = new AskUserController(questionnaire);
    controller.goNext();
    controller.setAnswer("reason", { kind: "text", value: "fast linting" });

    expect(controller.canSubmit()).toBe(false);
    expect(controller.canPartialSubmit()).toBe(true);
    expect(controller.finishPartial()).toBe(true);
    expect(controller.outcome()).toMatchObject({
      status: "partial",
      missingQuestionIds: ["formatter"],
      answersById: {
        reason: { kind: "text", value: "fast linting" },
      },
    });
  });

  it("records discuss outcomes without losing prior answers", () => {
    const controller = new AskUserController(questionnaire);
    controller.setAnswer("formatter", {
      kind: "choice",
      selections: [{ value: "prettier", label: "Prettier" }],
    });

    expect(controller.finishDiscuss("Need a quick trade-off summary")).toBe(true);
    expect(controller.outcome()).toMatchObject({
      status: "discuss",
      discussMessage: "Need a quick trade-off summary",
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "prettier", label: "Prettier" }],
        },
      },
    });
  });

  it("trims selection notes and drops blank ones when storing choice answers", () => {
    const controller = new AskUserController(questionnaire);
    controller.setAnswer("formatter", {
      kind: "choice",
      selections: [
        { value: "biome", label: "Biome", note: "  Use repo defaults  " },
        { value: "prettier", label: "Prettier", note: "   " },
      ],
    });

    expect(controller.outcome()).toMatchObject({
      answersById: {
        formatter: {
          kind: "choice",
          selections: [
            { value: "biome", label: "Biome", note: "Use repo defaults" },
            { value: "prettier", label: "Prettier" },
          ],
        },
      },
    });
  });

  it("auto-selects an option when saving a note for an unselected single-select choice", () => {
    const controller = new AskUserController(questionnaire);

    controller.setChoiceOptionNote(formatterQuestion, 0, "  Use repo defaults  ");

    expect(controller.getChoiceOptionNote("formatter", "biome")).toBe("Use repo defaults");
    expect(controller.outcome()).toMatchObject({
      answersById: {
        formatter: {
          kind: "choice",
          selections: [{ value: "biome", label: "Biome", note: "Use repo defaults" }],
        },
      },
    });
  });

  it("removes a multi-select option note when that option is deselected", () => {
    const controller = new AskUserController(multiQuestionnaire);

    controller.setChoiceOptionNote(checksQuestion, 0, "Required for CI");
    controller.toggleChoiceOption(checksQuestion, 0);

    expect(controller.getChoiceOptionNote("checks", "lint")).toBeUndefined();
    expect(controller.getAnswer("checks")).toBeUndefined();
  });

  it("reports cancelled and aborted terminal states", () => {
    const cancelled = new AskUserController(questionnaire);
    cancelled.cancel();
    expect(cancelled.outcome().status).toBe("cancelled");

    const aborted = new AskUserController(questionnaire);
    aborted.abort();
    expect(aborted.outcome().status).toBe("aborted");
  });
});
