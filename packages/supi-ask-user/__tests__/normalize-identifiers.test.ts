import { describe, expect, it } from "vitest";
import { normalizeQuestionnaire } from "../src/normalize.ts";

describe("normalizeQuestionnaire identifier canonicalization", () => {
  it("accepts allowOther on multichoice questions", () => {
    const out = normalizeQuestionnaire({
      questions: [
        {
          type: "choice",
          id: "features",
          header: "Features",
          prompt: "Pick",
          multi: true,
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
          allowOther: true,
        },
      ],
    });
    expect(out.questions[0]).toMatchObject({ type: "choice", multi: true, allowOther: true });
  });

  it("canonicalizes question ids, option values, and recommendations by trimming", () => {
    const out = normalizeQuestionnaire({
      questions: [
        {
          type: "choice",
          id: "  scope  ",
          header: "Scope",
          prompt: "Pick",
          options: [
            { value: "  a  ", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
          recommendation: "  a  ",
        },
      ],
    });
    expect(out.questions[0]).toMatchObject({
      id: "scope",
      options: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
      recommendedIndexes: [0],
      defaultIndexes: [],
    });
  });

  it("rejects duplicate structured option values after trimming", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "scope",
            header: "Scope",
            prompt: "Pick",
            options: [
              { value: "a", label: "A1" },
              { value: " a ", label: "A2" },
            ],
          },
        ],
      }),
    ).toThrow(/duplicate option value/);
  });

  it("rejects duplicate question ids after trimming", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "x",
            header: "One",
            prompt: "Pick",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
          {
            type: "choice",
            id: " x ",
            header: "Two",
            prompt: "Pick",
            options: [
              { value: "c", label: "C" },
              { value: "d", label: "D" },
            ],
          },
        ],
      }),
    ).toThrow(/unique/);
  });
});
