import { describe, expect, it } from "vitest";
import { buildErrorResult, buildResult } from "../result.ts";
import type { Answer, NormalizedQuestion } from "../types.ts";

const choiceQuestion: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Scope?",
  options: [
    { value: "api_only", label: "API only" },
    { value: "full_rewrite", label: "Full rewrite" },
  ],
  allowOther: true,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

const multichoiceQuestion: NormalizedQuestion = {
  id: "features",
  header: "Features",
  type: "multichoice",
  prompt: "Features?",
  options: [
    { value: "preview", label: "Preview" },
    { value: "multi", label: "Multi-select" },
    { value: "discuss", label: "Discuss" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

describe("buildResult", () => {
  it("formats submitted answers as one line per question with header prefix", () => {
    const answers: Answer[] = [
      { questionId: "scope", source: "option", value: "api_only", optionIndex: 0, note: "safer" },
      {
        questionId: "features",
        source: "options",
        values: ["preview", "multi"],
        optionIndexes: [0, 1],
        selections: [
          { value: "preview", optionIndex: 0, note: "best demo" },
          { value: "multi", optionIndex: 1, note: "core capability" },
        ],
      },
    ];
    const result = buildResult([choiceQuestion, multichoiceQuestion], {
      terminalState: "submitted",
      answers,
    });
    const text = result.content[0].text;
    expect(text).toContain("Scope: API only — safer");
    expect(text).toContain("Features: Preview — best demo; Multi-select — core capability");
    expect(result.details.answersById.scope).toMatchObject({ value: "api_only" });
  });

  it("includes discuss outcomes explicitly", () => {
    const result = buildResult([choiceQuestion], {
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "discuss", value: "need more context" }],
    });
    expect(result.content[0].text).toBe("Scope: Discuss — need more context");
  });

  it("includes Other source label", () => {
    const result = buildResult([choiceQuestion], {
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "other", value: "scoped to api/" }],
    });
    expect(result.content[0].text).toBe("Scope: Other — scoped to api/");
  });

  it("emits explicit cancellation and aborted summaries", () => {
    expect(
      buildResult([choiceQuestion], { terminalState: "cancelled", answers: [] }).content[0].text,
    ).toBe("User cancelled the questionnaire.");
    expect(
      buildResult([choiceQuestion], { terminalState: "aborted", answers: [] }).content[0].text,
    ).toMatch(/aborted/i);
  });
});

describe("buildErrorResult", () => {
  it("returns a single-line content with empty details and cancelled state", () => {
    const result = buildErrorResult("nope");
    expect(result.content[0].text).toBe("nope");
    expect(result.details.questions).toEqual([]);
    expect(result.details.terminalState).toBe("cancelled");
  });
});
