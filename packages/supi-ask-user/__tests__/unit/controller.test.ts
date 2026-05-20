import { describe, expect, it } from "vitest";
import { AskUserController } from "../../src/session/controller.ts";
import type { NormalizedQuestionnaire } from "../../src/types.ts";

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

  it("reports cancelled and aborted terminal states", () => {
    const cancelled = new AskUserController(questionnaire);
    cancelled.cancel();
    expect(cancelled.outcome().status).toBe("cancelled");

    const aborted = new AskUserController(questionnaire);
    aborted.abort();
    expect(aborted.outcome().status).toBe("aborted");
  });
});
