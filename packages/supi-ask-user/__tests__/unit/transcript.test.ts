import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderAskUserCall, renderAskUserResult } from "../../src/render/transcript.ts";
import type { AskUserToolDetails } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

type TranscriptResult = Pick<AgentToolResult<AskUserToolDetails>, "content" | "details">;
type RenderAskUserResult = (
  result: TranscriptResult,
  theme: Theme,
  options?: { expanded?: boolean },
) => { render(width: number): string[] };

const renderResult = renderAskUserResult as unknown as RenderAskUserResult;

describe("ask_user transcript rendering", () => {
  it("renders call metadata using the form title", () => {
    const component = renderAskUserCall(
      {
        title: "Formatter decision",
        questions: [
          {
            type: "choice",
            id: "formatter",
            header: "Formatter",
            prompt: "Pick one",
            options: [
              { value: "biome", label: "Biome" },
              { value: "prettier", label: "Prettier" },
            ],
          },
        ],
      },
      theme,
    );

    expect(component.render(120).join("\n")).toContain("Formatter decision");
  });

  it("renders a compact submitted summary with counts, answers, and a review hint", () => {
    const lines = renderResultLines(
      {
        title: "Formatter decision",
        intro: "I need one explicit choice before I update the repo config.",
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("reason", "Reason", "Anything I should optimize for?", false),
        ],
        status: "submitted",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome", note: "Use repo defaults" }],
          },
          reason: { kind: "text", value: "Keep existing defaults" },
        },
        missingQuestionIds: [],
      },
      false,
    );

    expect(lines).toContain("Submitted · 2/2 answered");
    expect(lines).toContain("✓ Formatter: Biome (note: Use repo defaults)");
    expect(lines).toContain("✓ Reason: Keep existing defaults");
    expect(lines.join("\n")).toContain("Ctrl+O to review");
  });

  it("keeps collapsed summaries to two answers and reports hidden answers", () => {
    const lines = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("reason", "Reason", "Anything I should optimize for?", false),
          textQuestion("risk", "Risk tolerance", "How risky can this change be?"),
        ],
        status: "submitted",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome" }],
          },
          reason: { kind: "text", value: "Keep existing defaults" },
          risk: { kind: "text", value: "Low risk only" },
        },
        missingQuestionIds: [],
      },
      false,
    );

    expect(lines).toContain("Submitted · 3/3 answered");
    expect(lines).toContain("✓ Formatter: Biome");
    expect(lines).toContain("✓ Reason: Keep existing defaults");
    expect(lines.join("\n")).toContain("1 more answer");
    expect(lines.join("\n")).not.toContain("Risk tolerance: Low risk only");
  });

  it("renders collapsed partial summaries with missing-required meta", () => {
    const lines = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("reason", "Reason", "Anything I should optimize for?"),
        ],
        status: "partial",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome" }],
          },
        },
        missingQuestionIds: ["reason"],
      },
      false,
    );

    expect(lines).toContain("Partial · 1/2 answered");
    expect(lines).toContain("✓ Formatter: Biome");
    expect(lines.join("\n")).toContain("1 required missing");
    expect(lines.join("\n")).toContain("Ctrl+O to review");
  });

  it("renders collapsed discuss summaries with a discussion indicator", () => {
    const lines = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("risk", "Risk tolerance", "How risky can this change be?"),
        ],
        status: "discuss",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome" }],
          },
        },
        missingQuestionIds: ["risk"],
        discussMessage: "Need to discuss rollout first",
      },
      false,
    );

    expect(lines).toContain("Discuss · 1/2 answered");
    expect(lines).toContain("✓ Formatter: Biome");
    expect(lines.join("\n")).toContain("discussion message included");
    expect(lines.join("\n")).not.toContain("Need to discuss rollout first");
  });

  it("renders terminal cancelled and aborted states in both collapsed and expanded views", () => {
    for (const [status, expectedLine] of [
      ["cancelled", "Cancelled"],
      ["aborted", "Aborted"],
    ] as const) {
      const details = {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
        ],
        status,
        answersById: {},
        missingQuestionIds: [],
      } satisfies AskUserToolDetails;

      expect(renderResultLines(details, false)).toEqual([expectedLine]);
      expect(renderResultLines(details, true)).toEqual([expectedLine]);
    }
  });

  it("renders an expanded read-only review with title, intro, prompts, and answers", () => {
    const output = renderResultLines(
      {
        title: "Formatter decision",
        intro: "I need one explicit choice before I update the repo config.",
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("reason", "Reason", "Anything I should optimize for?", false),
        ],
        status: "submitted",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome", note: "Use repo defaults" }],
          },
          reason: { kind: "text", value: "Keep existing defaults" },
        },
        missingQuestionIds: [],
      },
      true,
    ).join("\n");

    expect(output).toContain("Submitted · 2/2 answered");
    expect(output).toContain("Formatter decision");
    expect(output).toContain("I need one explicit choice before I update the repo config.");
    expect(output).toContain("Which formatter should I configure?");
    expect(output).toContain("Answer: Biome (note: Use repo defaults)");
  });

  it("renders discuss details with missing required answers in expanded view", () => {
    const output = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter should I configure?"),
          textQuestion("risk", "Risk tolerance", "How risky can this change be?"),
        ],
        status: "discuss",
        answersById: {
          formatter: {
            kind: "choice",
            selections: [{ value: "biome", label: "Biome" }],
          },
        },
        missingQuestionIds: ["risk"],
        discussMessage: "Need to discuss rollout first",
      },
      true,
    ).join("\n");

    expect(output).toContain("Discuss · 1/2 answered");
    expect(output).toContain("Message: Need to discuss rollout first");
    expect(output).toContain("Still missing: Risk tolerance");
    expect(output).toContain("Risk tolerance");
    expect(output).toContain("Not answered");
  });

  it("renders error details as an error line", () => {
    const component = renderAskUserResult(
      {
        content: [{ type: "text", text: "Error: invalid" }],
        details: { kind: "error", message: "Error: invalid" },
      },
      theme,
    );

    expect(component.render(80).join("\n")).toContain("Error: invalid");
  });
});

function renderResultLines(details: AskUserToolDetails, expanded: boolean): string[] {
  return renderResult(
    {
      content: [{ type: "text", text: "unused" }],
      details,
    },
    theme,
    { expanded },
  )
    .render(120)
    .map((line) => line.trimEnd());
}

function choiceQuestion(id: string, header: string, prompt: string) {
  return {
    type: "choice" as const,
    id,
    header,
    prompt,
    required: true,
    options: [
      { value: "biome", label: "Biome" },
      { value: "prettier", label: "Prettier" },
    ],
    multi: false,
    allowOther: false,
    recommendedIndexes: [],
    initialIndexes: [],
  };
}

function textQuestion(id: string, header: string, prompt: string, required = true) {
  return {
    type: "text" as const,
    id,
    header,
    prompt,
    required,
  };
}
