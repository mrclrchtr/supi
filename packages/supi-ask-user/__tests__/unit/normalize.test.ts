import { describe, expect, it } from "vitest";
import { AskUserValidationError, normalizeQuestionnaire } from "../../src/normalize.ts";

describe("normalizeQuestionnaire", () => {
  it("accepts a valid mixed decision form", () => {
    const result = normalizeQuestionnaire({
      title: " Formatter ",
      intro: " Need one explicit answer ",
      allowPartialSubmit: true,
      questions: [
        {
          type: "choice",
          id: " formatter ",
          header: "Formatter",
          prompt: "Choose one",
          options: [
            { value: " biome ", label: " Biome ", description: "fast" },
            { value: "prettier", label: "Prettier", preview: "stable" },
          ],
          recommendation: "biome",
          initial: "biome",
        },
        {
          type: "text",
          id: "notes",
          header: "Notes",
          prompt: "Anything else?",
          required: false,
          placeholder: " optional ",
        },
      ],
    });

    expect(result).toMatchObject({
      title: "Formatter",
      intro: "Need one explicit answer",
      allowPartialSubmit: true,
      questions: [
        {
          type: "choice",
          id: "formatter",
          options: [
            { value: "biome", label: "Biome", description: "fast" },
            { value: "prettier", label: "Prettier", preview: "stable" },
          ],
          recommendedIndexes: [0],
          initialIndexes: [0],
        },
        {
          type: "text",
          id: "notes",
          placeholder: "optional",
          required: false,
        },
      ],
    });
  });

  it("rejects allowOther on multi-select questions", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "features",
            header: "Features",
            prompt: "Pick",
            multi: true,
            allowOther: true,
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
        ],
      }),
    ).toThrowError(AskUserValidationError);
  });

  it("rejects invalid initial values", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "formatter",
            header: "Formatter",
            prompt: "Pick",
            options: [
              { value: "biome", label: "Biome" },
              { value: "prettier", label: "Prettier" },
            ],
            initial: "rome",
          },
        ],
      }),
    ).toThrow(/initial value/i);
  });

  it("rejects duplicate question ids after trimming", () => {
    expect(() =>
      normalizeQuestionnaire({
        questions: [
          {
            type: "text",
            id: " scope ",
            header: "Scope",
            prompt: "One",
          },
          {
            type: "text",
            id: "scope",
            header: "Scope 2",
            prompt: "Two",
          },
        ],
      }),
    ).toThrow(/Duplicate question id/);
  });
});
