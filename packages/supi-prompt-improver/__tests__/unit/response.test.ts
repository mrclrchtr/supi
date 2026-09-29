import { AskUserParamsSchema } from "@mrclrchtr/supi-ask-user/api";
import { describe, expect, it } from "vitest";
import { parseImprovementResponse } from "../../src/response.ts";
import { makeAssistantMessage } from "../helpers/command-harness.ts";

const textQuestion = {
  type: "text",
  id: "scope",
  header: "Scope",
  prompt: "Which file should change?",
};
const choiceQuestion = {
  type: "choice",
  id: "mode",
  header: "Mode",
  prompt: "Which mode should it use?",
  options: [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
};

function clarification(questions: unknown[]) {
  return { kind: "clarification", questionnaire: { questions } };
}

describe("prompt response validation", () => {
  it("accepts the shared question limit and rejects excess questions", () => {
    const questions = Array.from(
      {
        length: (AskUserParamsSchema.properties.questions as unknown as { maxItems: number })
          .maxItems,
      },
      (_, id) => ({ ...textQuestion, id: String(id) }),
    );
    expect(parseImprovementResponse(makeAssistantMessage(clarification(questions))).kind).toBe(
      "clarification",
    );
    questions.push({ ...textQuestion, id: "excess" });
    expect(() =>
      parseImprovementResponse(makeAssistantMessage(clarification(questions))),
    ).toThrow();
  });

  it("accepts terminal results and preserves literal proposal spacing", () => {
    expect(parseImprovementResponse(makeAssistantMessage({ kind: "unchanged" }))).toEqual({
      kind: "unchanged",
    });
    const proposal = { kind: "proposal", proposal: "  Keep literal spacing.  " };
    expect(parseImprovementResponse(makeAssistantMessage(proposal))).toEqual(proposal);
    expect(() =>
      parseImprovementResponse(makeAssistantMessage({ kind: "proposal", proposal: "  " })),
    ).toThrow();
  });

  it("accepts both question types and more than three questions", () => {
    const response = clarification([
      textQuestion,
      choiceQuestion,
      { ...textQuestion, id: "other" },
      { ...textQuestion, id: "fourth" },
    ]);
    expect(parseImprovementResponse(makeAssistantMessage(response)).kind).toBe("clarification");
  });

  it.each([
    { kind: "unchanged", extra: true },
    { kind: "proposal", proposal: "Change the file.", extra: true },
    { ...clarification([textQuestion]), extra: true },
    { kind: "clarification", questionnaire: { questions: [textQuestion], extra: true } },
    clarification([{ ...textQuestion, extra: true }]),
    clarification([{ ...choiceQuestion, extra: true }]),
    clarification([
      {
        ...choiceQuestion,
        options: [
          { value: "a", label: "A", extra: true },
          { value: "b", label: "B" },
        ],
      },
    ]),
    clarification([]),
    clarification([textQuestion, textQuestion]),
  ])("rejects invalid responses %#", (response) => {
    expect(() => parseImprovementResponse(makeAssistantMessage(response))).toThrow();
  });
});
