import { describe, expect, it } from "vitest";
import { buildResult } from "../../src/render/result.ts";
import type { AskUserOutcome, NormalizedQuestionnaire } from "../../src/types.ts";

describe("ask_user result formatting", () => {
  it("truncates large model-visible summaries with a clear notice", () => {
    const questionnaire: NormalizedQuestionnaire = {
      questions: [
        {
          type: "text",
          id: "notes",
          header: "Notes",
          prompt: "What should the agent know?",
        },
      ],
    };
    const outcome: AskUserOutcome = {
      outcome: "submitted",
      responses: [
        {
          questionId: "notes",
          answer: {
            kind: "text",
            answered: true,
            value: Array.from({ length: 2_100 }, (_, index) => `line ${index}`).join("\n"),
          },
        },
      ],
    };

    const result = buildResult(questionnaire, outcome);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";

    expect(text).toContain("Notes: line 0");
    expect(text).toContain("[Output truncated:");
    expect(text).toContain("ask a focused follow-up for omitted text");
    expect(text).not.toContain("line 2099");
  });
});
