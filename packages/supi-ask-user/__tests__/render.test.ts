import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderAskUserCall, renderAskUserResult } from "../render.ts";
import { ASK_USER_ERROR_MARKER, buildErrorResult } from "../result.ts";

const theme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `<b>${text}</b>`,
  bg: (_color: string, text: string) => text,
  // biome-ignore lint/suspicious/noExplicitAny: minimal Theme stub for unit tests
} as any;

describe("renderAskUserCall", () => {
  it("renders a count and joined header list", () => {
    const text = renderAskUserCall(
      {
        questions: [
          { type: "choice", id: "scope", header: "Scope" },
          { type: "multichoice", id: "features", header: "Features" },
        ],
      },
      theme,
    );
    const rendered = text.render(120).join("\n");
    expect(rendered).toContain("ask_user");
    expect(rendered).toContain("2 questions");
    expect(rendered).toContain("Scope, Features");
  });

  it("wraps long headers instead of truncating with ellipsis", () => {
    const longHeader = "A very long question header that would exceed sixty columns easily";
    const secondHeader = "Another long descriptive header for testing";
    const text = renderAskUserCall(
      {
        questions: [
          { type: "text", id: "q1", header: longHeader },
          { type: "text", id: "q2", header: secondHeader },
        ],
      },
      theme,
    );
    const rendered = text.render(80).join("\n");
    const stripped = rendered.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ");
    // Every word of both headers should appear (wrapped, not truncated with "...")
    for (const word of longHeader.split(/\s+/)) {
      expect(stripped).toContain(word);
    }
    for (const word of secondHeader.split(/\s+/)) {
      expect(stripped).toContain(word);
    }
    // No ellipsis truncation
    expect(stripped).not.toContain("...");
  });

  it("renders single question without parentheses", () => {
    const text = renderAskUserCall(
      {
        questions: [{ type: "yesno", id: "confirm", header: "Confirm" }],
      },
      theme,
    );
    const rendered = text.render(80).join("\n");
    expect(rendered).toContain("Confirm");
    expect(rendered).toContain("1 question");
  });

  it("handles no questions gracefully", () => {
    const text = renderAskUserCall({ questions: [] }, theme);
    const rendered = text.render(80).join("\n");
    expect(rendered).toContain("? questions");
  });
});

describe("renderAskUserResult", () => {
  it("renders cancelled state with a warning label", () => {
    const text = renderAskUserResult(
      {
        details: { questions: [], answers: [], terminalState: "cancelled" },
        content: [{ type: "text", text: "User cancelled the questionnaire." }],
      },
      theme,
    );
    expect(text.render(120).join("")).toContain("Cancelled");
  });

  it("renders errors using the marker as an error string, not 'Cancelled'", () => {
    const errorResult = buildErrorResult("Error: 1-4 questions only");
    const text = renderAskUserResult(errorResult, theme);
    const out = text.render(120).join("");
    expect(out).toContain("[error]");
    expect(out).toContain("Error: 1-4 questions only");
    expect(out).not.toContain("Cancelled");
  });

  it("error marker is set on error results", () => {
    const result = buildErrorResult("nope");
    expect((result.details as unknown as Record<string, unknown>)[ASK_USER_ERROR_MARKER]).toBe(
      true,
    );
  });

  it("wraps long text answer values instead of truncating", () => {
    const longAnswer =
      "This is a very detailed freeform response that would span multiple lines when rendered in a typical transcript column width";
    const text = renderAskUserResult(
      {
        details: {
          questions: [
            {
              id: "feedback",
              header: "Feedback",
              type: "text",
              prompt: "Tell us more",
              options: [],
            },
          ],
          answers: [{ questionId: "feedback", source: "text", value: longAnswer }],
          answersById: {
            feedback: { questionId: "feedback", source: "text", value: longAnswer },
          },
          terminalState: "submitted",
        },
        content: [{ type: "text", text: `Feedback: ${longAnswer}` }],
      },
      theme,
    );
    // Render at narrow width; verify wrapping not truncation
    const rendered = text.render(60).join("\n");
    const stripped = rendered.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ");
    // Every word of the answer should appear (wrapped, not truncated)
    for (const word of longAnswer.split(/\s+/)) {
      expect(stripped).toContain(word);
    }
    // No ellipsis truncation in the wrapped output
    expect(stripped).not.toContain("...");
  });

  it("renders multiselect and note summaries in submitted results", () => {
    const text = renderAskUserResult(
      {
        details: {
          questions: [
            {
              id: "features",
              header: "Features",
              type: "multichoice",
              prompt: "Pick",
              options: [
                { value: "preview", label: "Preview" },
                { value: "multi", label: "Multi-select" },
              ],
              allowOther: false,
              allowDiscuss: true,
              recommendedIndexes: [0],
            },
            {
              id: "scope",
              header: "Scope",
              type: "choice",
              prompt: "Pick",
              options: [
                { value: "api_only", label: "API only" },
                { value: "full_rewrite", label: "Full rewrite" },
              ],
              allowOther: true,
              allowDiscuss: true,
              recommendedIndexes: [0],
            },
          ],
          answers: [
            {
              questionId: "features",
              source: "options",
              values: ["preview", "multi"],
              optionIndexes: [0, 1],
              selections: [
                { value: "preview", optionIndex: 0, note: "best demo" },
                { value: "multi", optionIndex: 1 },
              ],
            },
            {
              questionId: "scope",
              source: "option",
              value: "api_only",
              optionIndex: 0,
              note: "safer",
            },
          ],
          answersById: {
            features: {
              questionId: "features",
              source: "options",
              values: ["preview", "multi"],
              optionIndexes: [0, 1],
              selections: [
                { value: "preview", optionIndex: 0, note: "best demo" },
                { value: "multi", optionIndex: 1 },
              ],
            },
            scope: {
              questionId: "scope",
              source: "option",
              value: "api_only",
              optionIndex: 0,
              note: "safer",
            },
          },
          terminalState: "submitted",
        },
        content: [
          {
            type: "text",
            text: "Features: Preview — best demo; Multi-select\nScope: API only — safer",
          },
        ],
      },
      theme,
    );
    const rendered = text.render(120).join("");
    expect(rendered).toContain("Preview — best demo");
    expect(rendered).toContain("API only — safer");
  });
});
