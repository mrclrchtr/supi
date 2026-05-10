import { describe, expect, it } from "vitest";
import { buildErrorResult, buildResult } from "../src/result.ts";
import type { Answer, NormalizedQuestion } from "../src/types.ts";

const choiceQuestion: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Scope?",
  required: true,
  options: [
    { value: "api_only", label: "API only" },
    { value: "full_rewrite", label: "Full rewrite" },
  ],
  allowOther: true,
  allowDiscuss: true,
  recommendedIndexes: [0],
  defaultIndexes: [],
};

const multichoiceQuestion: NormalizedQuestion = {
  id: "features",
  header: "Features",
  type: "multichoice",
  prompt: "Features?",
  required: true,
  options: [
    { value: "preview", label: "Preview" },
    { value: "multi", label: "Multi-select" },
    { value: "discuss", label: "Discuss" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0],
  defaultIndexes: [],
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

  it("includes skip flag and partial answers for skipped outcome", () => {
    const optionalQuestion: NormalizedQuestion = {
      id: "note",
      header: "Note",
      type: "text",
      prompt: "Note?",
      required: false,
      options: [],
    };
    const result = buildResult([choiceQuestion, optionalQuestion], {
      terminalState: "skipped",
      answers: [{ questionId: "scope", source: "option", value: "api_only", optionIndex: 0 }],
      skipped: true,
    });
    expect(result.skip).toBe(true);
    expect(result.content[0].text).toContain("User skipped the questionnaire");
    expect(result.content[0].text).toContain("Note: (skipped)");
    expect(result.details.answersById.scope).toMatchObject({ value: "api_only" });
    expect(result.details.answersById.note).toBeUndefined();
  });

  it("preserves undefined values for unanswered optional questions", () => {
    const optionalQuestion: NormalizedQuestion = {
      id: "note",
      header: "Note",
      type: "text",
      prompt: "Note?",
      required: false,
      options: [],
    };
    const result = buildResult([choiceQuestion, optionalQuestion], {
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", value: "api_only", optionIndex: 0 }],
    });
    expect(result.details.answersById.scope).toMatchObject({ value: "api_only" });
    expect(result.details.answersById.note).toBeUndefined();
    expect(Object.keys(result.details.answersById)).toContain("note");
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
