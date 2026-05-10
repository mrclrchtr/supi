import { describe, expect, it } from "vitest";
import { AskUserValidationError, normalizeQuestionnaire } from "../src/normalize.ts";
import type { AskUserParams } from "../src/schema.ts";

type ChoiceQuestion = Extract<AskUserParams["questions"][number], { type: "choice" }>;

const choice = (overrides: Partial<ChoiceQuestion> = {}): ChoiceQuestion => ({
  type: "choice",
  id: "q1",
  header: "Pick",
  prompt: "Pick one",
  options: [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ],
  ...overrides,
});

describe("normalizeQuestionnaire", () => {
  it("accepts a valid mixed questionnaire with previews and explicit flags", () => {
    const params: AskUserParams = {
      questions: [
        choice({
          id: "scope",
          header: "Scope",
          allowOther: true,
          allowDiscuss: true,
          options: [
            { value: "a", label: "Alpha", preview: "const a = 1;" },
            { value: "b", label: "Beta", description: "second option" },
          ],
          recommendation: "a",
        }),
        {
          type: "multichoice",
          id: "features",
          header: "Features",
          prompt: "Pick features",
          options: [
            { value: "preview", label: "Preview" },
            { value: "discuss", label: "Discuss" },
          ],
          recommendation: ["preview"],
          allowOther: true,
          allowDiscuss: true,
        },
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?", allowDiscuss: true },
        { type: "text", id: "note", header: "Note", prompt: "Why?" },
      ],
    };

    const out = normalizeQuestionnaire(params);
    expect(out.questions.map((question) => question.type)).toEqual([
      "choice",
      "multichoice",
      "yesno",
      "text",
    ]);
    expect(out.questions[0]).toMatchObject({ allowOther: true, allowDiscuss: true });
    expect(out.questions[0].options[0].preview).toBe("const a = 1;");
    expect(out.questions[1]).toMatchObject({ allowOther: true, recommendedIndexes: [0] });
  });

  it("rejects 0 questions", () => {
    expect(() => normalizeQuestionnaire({ questions: [] })).toThrow(AskUserValidationError);
  });

  it("rejects more than 4 questions", () => {
    const five = Array.from({ length: 5 }, (_, index) => choice({ id: `q${index}` }));
    expect(() => normalizeQuestionnaire({ questions: five })).toThrow(/1-4 questions/);
  });

  it("rejects duplicate question ids", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ id: "x" }), choice({ id: "x" })] }),
    ).toThrow(/unique/);
  });

  it("rejects recommendation that does not match an option value", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ recommendation: "missing" })] }),
    ).toThrow(/not one of its option values/);
  });

  it("rejects duplicate multichoice recommended values", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "multichoice",
            id: "features",
            header: "Features",
            prompt: "Pick",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
            recommendation: ["a", "a"],
          },
        ],
      }),
    ).toThrow(/duplicate recommended value/);
  });

  it("synthesizes yes/no options for yesno questions", () => {
    const out = normalizeQuestionnaire({
      questions: [{ type: "yesno", id: "y", header: "Y?", prompt: "Yes?" }],
    });
    expect(out.questions[0].options.map((option) => option.value)).toEqual(["yes", "no"]);
  });

  it("passes through default on text questions", () => {
    const out = normalizeQuestionnaire({
      questions: [
        { type: "text", id: "note", header: "Note", prompt: "Why?", default: "  because  " },
      ],
    });
    expect(out.questions[0]).toMatchObject({ type: "text", default: "because" });
  });

  it("omits default when not provided on text questions", () => {
    const out = normalizeQuestionnaire({
      questions: [{ type: "text", id: "note", header: "Note", prompt: "Why?" }],
    });
    expect((out.questions[0] as { default?: string }).default).toBeUndefined();
  });

  it("rejects whitespace-only id, header, and prompt", () => {
    expect(() => normalizeQuestionnaire({ questions: [choice({ id: "   " })] })).toThrow(
      /non-empty/,
    );
    expect(() => normalizeQuestionnaire({ questions: [choice({ header: "   " })] })).toThrow(
      /non-empty header/,
    );
    expect(() => normalizeQuestionnaire({ questions: [choice({ prompt: "   " })] })).toThrow(
      /non-empty prompt/,
    );
  });
});
