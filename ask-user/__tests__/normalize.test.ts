import { describe, expect, it } from "vitest";
import { AskUserValidationError, normalizeQuestionnaire } from "../normalize.ts";
import type { AskUserParams } from "../schema.ts";

const choice = (
  overrides: Partial<AskUserParams["questions"][number]> = {},
): AskUserParams["questions"][number] => ({
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
  it("accepts a valid mixed questionnaire (choice + text + yesno)", () => {
    const params: AskUserParams = {
      questions: [
        choice({ id: "scope", header: "Scope" }),
        { type: "text", id: "name", header: "Name", prompt: "Pick a name" },
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?", recommendation: "yes" },
      ],
    };
    const out = normalizeQuestionnaire(params);
    expect(out.questions.map((q) => q.type)).toEqual(["choice", "text", "yesno"]);
    expect(out.questions[2].recommendedIndex).toBe(0);
  });

  it("rejects 0 questions", () => {
    expect(() => normalizeQuestionnaire({ questions: [] })).toThrow(AskUserValidationError);
  });

  it("rejects more than 4 questions", () => {
    const five = Array.from({ length: 5 }, (_, i) => choice({ id: `q${i}` }));
    expect(() => normalizeQuestionnaire({ questions: five })).toThrow(/1-4 questions/);
  });

  it("rejects duplicate question ids", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ id: "x" }), choice({ id: "x" })] }),
    ).toThrow(/unique/);
  });

  it("rejects overlong header", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ header: "x".repeat(41) })] }),
    ).toThrow(/header/);
  });

  it("rejects choice questions with too few options", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ options: [{ value: "a", label: "A" }] })] }),
    ).toThrow(/2-8 options/);
  });

  it("rejects choice questions with too many options", () => {
    const options = Array.from({ length: 9 }, (_, i) => ({
      value: `v${i}`,
      label: `L${i}`,
    }));
    expect(() => normalizeQuestionnaire({ questions: [choice({ options })] })).toThrow(
      /2-8 options/,
    );
  });

  it("rejects recommendation that doesn't match an option value", () => {
    expect(() =>
      normalizeQuestionnaire({ questions: [choice({ recommendation: "missing" })] }),
    ).toThrow(/not one of its option values/);
  });

  it("resolves recommendation to the matching option index", () => {
    const out = normalizeQuestionnaire({ questions: [choice({ recommendation: "b" })] });
    expect(out.questions[0].recommendedIndex).toBe(1);
  });

  it("synthesizes yes/no options for yesno questions", () => {
    const out = normalizeQuestionnaire({
      questions: [{ type: "yesno", id: "y", header: "Y?", prompt: "Yes?" }],
    });
    expect(out.questions[0].options.map((o) => o.value)).toEqual(["yes", "no"]);
  });

  it("text questions get empty options and never allow Other", () => {
    const out = normalizeQuestionnaire({
      questions: [{ type: "text", id: "t", header: "T", prompt: "Type" }],
    });
    const q = out.questions[0];
    expect(q.options).toEqual([]);
    expect(q.allowOther).toBe(false);
  });

  it("rejects whitespace-only id", () => {
    expect(() => normalizeQuestionnaire({ questions: [choice({ id: "   " })] })).toThrow(
      /non-empty/,
    );
  });

  it("rejects whitespace-only header", () => {
    expect(() => normalizeQuestionnaire({ questions: [choice({ header: "  \t " })] })).toThrow(
      /non-empty header/,
    );
  });

  it("rejects whitespace-only prompt", () => {
    expect(() => normalizeQuestionnaire({ questions: [choice({ prompt: "\n\n" })] })).toThrow(
      /non-empty prompt/,
    );
  });

  it("rejects choice options whose value or label is whitespace-only", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          choice({
            options: [
              { value: "   ", label: "Alpha" },
              { value: "b", label: "Beta" },
            ],
          }),
        ],
      }),
    ).toThrow(/empty value or label/);
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          choice({
            options: [
              { value: "a", label: "Alpha" },
              { value: "b", label: "   " },
            ],
          }),
        ],
      }),
    ).toThrow(/empty value or label/);
  });

  it("rejects duplicate option values within one question", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          choice({
            options: [
              { value: "a", label: "A1" },
              { value: "a", label: "A2" },
            ],
          }),
        ],
      }),
    ).toThrow(/duplicate option value/);
  });
});
