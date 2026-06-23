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

  it("renders a compact submitted summary with answered count and responses", () => {
    const output = renderResultLines(
      {
        title: "Formatter decision",
        intro: "I need one explicit choice.",
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter?"),
          textQuestion("reason", "Reason", "Anything else?"),
        ],
        outcome: "submitted",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice" as const,
              answered: true,
              options: [
                { value: "biome", label: "Biome", selected: true, comment: "Use repo defaults" },
              ],
            },
          },
          {
            questionId: "reason",
            answer: { kind: "text" as const, answered: true, value: "Keep defaults" },
          },
        ],
      },
      false,
    ).join("\n");

    expect(output).toContain("Submitted · 2/2 answered");
    expect(output).toContain("Biome (comment: Use repo defaults)");
    expect(output).toContain("Keep defaults");
  });

  it("keeps collapsed summaries to two responses and reports hidden count", () => {
    const output = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter?"),
          textQuestion("reason", "Reason", "Anything else?"),
          textQuestion("risk", "Risk tolerance", "How risky?"),
        ],
        outcome: "submitted",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice" as const,
              answered: true,
              options: [{ value: "biome", label: "Biome", selected: true }],
            },
          },
          {
            questionId: "reason",
            answer: { kind: "text" as const, answered: true, value: "Keep defaults" },
          },
          {
            questionId: "risk",
            answer: { kind: "text" as const, answered: true, value: "Low risk only" },
          },
        ],
      },
      false,
    ).join("\n");

    expect(output).toContain("Submitted · 3/3 answered");
    expect(output).toContain("Biome");
    expect(output).toContain("Keep defaults");
    expect(output).toContain("1 more answer");
    expect(output).not.toContain("Low risk only");
  });

  it("renders needs_discussion as incomplete", () => {
    const output = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter?"),
          textQuestion("reason", "Reason", "Anything else?"),
        ],
        outcome: "needs_discussion",
        comment: "Need more context",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice" as const,
              answered: true,
              options: [{ value: "biome", label: "Biome", selected: true }],
            },
          },
          {
            questionId: "reason",
            questionComment: "Will clarify",
            answer: { kind: "text" as const, answered: false },
          },
        ],
      },
      false,
    ).join("\n");

    expect(output).toMatch(/unanswered/i);
  });

  it("renders expanded view with title, intro, questions, responses, comments", () => {
    const output = renderResultLines(
      {
        title: "Formatter decision",
        intro: "I need one explicit choice.",
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter?"),
          textQuestion("reason", "Reason", "Anything else?"),
        ],
        outcome: "submitted",
        comment: "Done with caution",
        responses: [
          {
            questionId: "formatter",
            questionComment: "Talked to team",
            answer: {
              kind: "choice" as const,
              answered: true,
              options: [
                { value: "biome", label: "Biome", selected: true, comment: "Repo defaults" },
                { value: "prettier", label: "Prettier", selected: false, comment: "Avoid here" },
              ],
            },
          },
          {
            questionId: "reason",
            answer: { kind: "text" as const, answered: true, value: "Keep defaults" },
          },
        ],
      },
      true,
    ).join("\n");

    expect(output).toContain("Submitted · 2/2 answered");
    expect(output).toContain("Formatter decision");
    expect(output).toContain("I need one explicit choice.");
    expect(output).toContain("Which formatter?");
    expect(output).toContain("Biome");
    expect(output).toContain("Repo defaults");
    expect(output).toContain("Prettier");
    expect(output).toContain("Avoid here");
    expect(output).toContain("Talked to team");
    expect(output).toContain("Done with caution");
    expect(output).toContain("Keep defaults");
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

  it("renders thrown execution errors from model-visible content", () => {
    const component = renderAskUserResult(
      {
        content: [{ type: "text", text: "ask_user failed badly" }],
        details: {} as AskUserToolDetails,
      },
      theme,
      {},
      { isError: true },
    );

    expect(component.render(80).join("\n")).toContain("ask_user failed badly");
  });

  it("renders partial result content without requiring final details", () => {
    const component = renderAskUserResult(
      {
        content: [{ type: "text", text: "Waiting for user response..." }],
        details: {} as AskUserToolDetails,
      },
      theme,
      { isPartial: true },
    );

    expect(component.render(80).join("\n")).toContain("Waiting for user response...");
  });

  it("renders needs_discussion expanded with unanswered state", () => {
    const output = renderResultLines(
      {
        questions: [
          choiceQuestion("formatter", "Formatter", "Which formatter?"),
          textQuestion("reason", "Reason", "Anything else?"),
        ],
        outcome: "needs_discussion",
        comment: "Need more info",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice" as const,
              answered: true,
              options: [{ value: "biome", label: "Biome", selected: true }],
            },
          },
          {
            questionId: "reason",
            questionComment: "Will decide later",
            answer: { kind: "text" as const, answered: false },
          },
        ],
      },
      true,
    ).join("\n");

    expect(output).toMatch(/unanswered/i);
    expect(output).toContain("Will decide later");
    expect(output).toContain("Need more info");
  });

  it("renders comments on unanswered choice options in expanded view", () => {
    const output = renderResultLines(
      {
        questions: [choiceQuestion("formatter", "Formatter", "Which formatter?")],
        outcome: "needs_discussion",
        responses: [
          {
            questionId: "formatter",
            answer: {
              kind: "choice" as const,
              answered: false,
              options: [
                {
                  value: "prettier",
                  label: "Prettier",
                  selected: false,
                  comment: "Maybe better for the team",
                },
              ],
            },
          },
        ],
      },
      true,
    ).join("\n");

    expect(output).toContain("Not answered");
    expect(output).toContain("Prettier");
    expect(output).toContain("Maybe better for the team");
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
    options: [
      { value: "biome", label: "Biome" },
      { value: "prettier", label: "Prettier" },
    ],
    multi: false,
    recommendedIndexes: [0],
  };
}

function textQuestion(id: string, header: string, prompt: string) {
  return {
    type: "text" as const,
    id,
    header,
    prompt,
  };
}
