import { describe, expect, it } from "vitest";
import { AskUserValidationError, normalizeQuestionnaire } from "../../src/normalize.ts";

describe("normalizeQuestionnaire", () => {
  describe("deprecated field rejection", () => {
    it("rejects top-level allowPartialSubmit", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
            },
          ],
          // @ts-expect-error — deprecated field for hard-cut rejection test
          allowPartialSubmit: true,
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("rejects question-level required field", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
              // @ts-expect-error — deprecated field
              required: true,
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("rejects question-level initial field", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
              // @ts-expect-error — deprecated field
              initial: "biome",
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("rejects question-level allowOther field", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
              // @ts-expect-error — deprecated field
              allowOther: true,
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });
  });

  describe("recommendation/default rules", () => {
    it("single-select with recommendation string uses those indexes", () => {
      const result = normalizeQuestionnaire({
        title: " Formatter ",
        intro: " Need one explicit answer ",
        questions: [
          {
            type: "choice",
            id: " formatter ",
            header: "Formatter",
            prompt: "Choose one",
            options: [
              { value: " biome ", label: " Biome ", description: "fast" },
              { value: "prettier", label: "Prettier", preview: "stable" },
              { value: "rome", label: "Rome" },
            ],
            recommendation: "biome",
          },
        ],
      });

      expect(result).toMatchObject({
        title: "Formatter",
        intro: "Need one explicit answer",
        questions: [
          {
            type: "choice",
            id: "formatter",
            options: [
              { value: "biome", label: "Biome", description: "fast" },
              { value: "prettier", label: "Prettier", preview: "stable" },
              { value: "rome", label: "Rome" },
            ],
            recommendedIndexes: [0],
          },
        ],
      });
      // Confirm no deprecated fields leaked through
      expect(result).not.toHaveProperty("allowPartialSubmit");
    });

    it("single-select without recommendation defaults to first option", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "fmt",
            header: "Formatter",
            prompt: "Pick one",
            options: [
              { value: "biome", label: "Biome" },
              { value: "prettier", label: "Prettier" },
            ],
          },
        ],
      });

      expect(result.questions[0]).toMatchObject({
        recommendedIndexes: [0],
      });
    });

    it("multi-select with recommendation array uses those indexes", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "checks",
            header: "Checks",
            prompt: "Which ones?",
            multi: true,
            recommendation: ["lint", "tests"],
            options: [
              { value: "lint", label: "Lint" },
              { value: "tests", label: "Tests" },
              { value: "format", label: "Format" },
            ],
          },
        ],
      });

      expect(result.questions[0]).toMatchObject({
        recommendedIndexes: [0, 1],
      });
    });

    it("multi-select without recommendation selects nothing", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "choice",
            id: "checks",
            header: "Checks",
            prompt: "Which ones?",
            multi: true,
            options: [
              { value: "lint", label: "Lint" },
              { value: "tests", label: "Tests" },
            ],
          },
        ],
      });

      expect(result.questions[0]).toMatchObject({
        recommendedIndexes: [],
      });
    });

    it("rejects array recommendation on single-select choice", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              recommendation: ["biome", "prettier"],
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("rejects string recommendation on multi-select choice", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "checks",
              header: "Checks",
              prompt: "Which ones?",
              multi: true,
              recommendation: "lint",
              options: [
                { value: "lint", label: "Lint" },
                { value: "tests", label: "Tests" },
              ],
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("rejects recommendation value that does not match any option", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              recommendation: "rome",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
            },
          ],
        }),
      ).toThrowError(AskUserValidationError);
    });

    it("mismatch error names the bad value and lists the allowed option values", () => {
      expect(() =>
        normalizeQuestionnaire({
          questions: [
            {
              type: "choice",
              id: "fmt",
              header: "Formatter",
              prompt: "Pick one",
              recommendation: "rome",
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
            },
          ],
        }),
      ).toThrowError(/recommendation value "rome".*Allowed values: \["biome", "prettier"\]/);
    });
  });

  describe("text question recommendation", () => {
    it("accepts trimmed recommendation on text questions", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "text",
            id: "notes",
            header: "Notes",
            prompt: "Anything else?",
            recommendation: "  No, that's all  ",
          },
        ],
      });

      expect(result.questions[0]).toMatchObject({
        recommendation: "No, that's all",
      });
    });

    it("omits blank text recommendation", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "text",
            id: "notes",
            header: "Notes",
            prompt: "Anything else?",
            recommendation: "   ",
          },
        ],
      });

      expect(result.questions[0]).not.toHaveProperty("recommendation");
    });

    it("accepts placeholder on text questions", () => {
      const result = normalizeQuestionnaire({
        questions: [
          {
            type: "text",
            id: "notes",
            header: "Notes",
            prompt: "Anything else?",
            placeholder: "  optional  ",
          },
        ],
      });

      expect(result.questions[0]).toMatchObject({
        placeholder: "optional",
      });
    });
  });

  it("accepts a valid mixed decision form with both choice and text questions", () => {
    const result = normalizeQuestionnaire({
      title: " Formatter ",
      intro: " Need one explicit answer ",
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
        },
        {
          type: "text",
          id: "notes",
          header: "Notes",
          prompt: "Anything else?",
          placeholder: " optional ",
        },
      ],
    });

    expect(result).toMatchObject({
      title: "Formatter",
      intro: "Need one explicit answer",
      questions: [
        {
          type: "choice",
          id: "formatter",
          options: [
            { value: "biome", label: "Biome", description: "fast" },
            { value: "prettier", label: "Prettier", preview: "stable" },
          ],
          recommendedIndexes: [0],
        },
        {
          type: "text",
          id: "notes",
          placeholder: "optional",
        },
      ],
    });
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

  it("rejects invalid recommendation values", () => {
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
            recommendation: "rome",
          },
        ],
      }),
    ).toThrowError(AskUserValidationError);
  });
});
