import { describe, expect, it } from "vitest";
import { buildErrorResult, buildResult } from "../result.ts";
import type { Answer, NormalizedQuestion } from "../types.ts";

const choiceQuestion: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Scope?",
  options: [
    { value: "narrow", label: "Narrow" },
    { value: "broad", label: "Broad" },
  ],
};

const yesNoQuestion: NormalizedQuestion = {
  ...choiceQuestion,
  id: "go",
  header: "Go?",
  type: "yesno",
  prompt: "Proceed?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
};

describe("buildResult", () => {
  it("formats submitted answers as one line per question with header prefix", () => {
    const answers: Answer[] = [
      { questionId: "scope", source: "option", value: "narrow", optionIndex: 0 },
      { questionId: "go", source: "yesno", value: "yes", optionIndex: 0 },
    ];
    const result = buildResult([choiceQuestion, yesNoQuestion], {
      terminalState: "submitted",
      answers,
    });
    const text = result.content[0].text;
    expect(text).toContain("Scope: Narrow");
    expect(text).toContain("Go?: Yes");
    expect(result.details.terminalState).toBe("submitted");
    expect(result.details.answers).toHaveLength(2);
  });

  it("renders the option label, not the stable value, when they diverge", () => {
    const q: NormalizedQuestion = {
      ...choiceQuestion,
      options: [
        { value: "api_only", label: "API only" },
        { value: "full_rewrite", label: "Full rewrite" },
      ],
    };
    const result = buildResult([q], {
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", value: "api_only", optionIndex: 0 }],
    });
    expect(result.content[0].text).toBe("Scope: API only");
    // The machine-readable value is preserved in `details` for callers that need it.
    expect(result.details.answers[0].value).toBe("api_only");
    expect(result.details.answersById.scope.value).toBe("api_only");
  });

  it("includes Other source label and trailing comment", () => {
    const result = buildResult([choiceQuestion], {
      terminalState: "submitted",
      answers: [
        {
          questionId: "scope",
          source: "other",
          value: "scoped to api/",
          comment: "ui changes follow",
        },
      ],
    });
    expect(result.content[0].text).toBe("Scope: Other — scoped to api/ — ui changes follow");
  });

  it("emits an explicit cancellation summary", () => {
    const result = buildResult([choiceQuestion], {
      terminalState: "cancelled",
      answers: [],
    });
    expect(result.content[0].text).toBe("User cancelled the questionnaire.");
    expect(result.details.terminalState).toBe("cancelled");
  });

  it("exposes per-question answers keyed by question id alongside the array", () => {
    const result = buildResult([choiceQuestion, yesNoQuestion], {
      terminalState: "submitted",
      answers: [
        { questionId: "scope", source: "option", value: "broad", optionIndex: 1 },
        { questionId: "go", source: "yesno", value: "no", optionIndex: 1 },
      ],
    });
    expect(Object.keys(result.details.answersById).sort()).toEqual(["go", "scope"]);
    expect(result.details.answersById.scope.value).toBe("broad");
    expect(result.details.answersById.go.value).toBe("no");
  });

  it("emits an explicit aborted summary", () => {
    const result = buildResult([choiceQuestion], {
      terminalState: "aborted",
      answers: [],
    });
    expect(result.content[0].text).toMatch(/aborted/i);
    expect(result.details.terminalState).toBe("aborted");
  });
});

describe("buildErrorResult", () => {
  it("returns a single-line content with empty details and cancelled state", () => {
    const r = buildErrorResult("nope");
    expect(r.content[0].text).toBe("nope");
    expect(r.details.questions).toEqual([]);
    expect(r.details.terminalState).toBe("cancelled");
  });
});
