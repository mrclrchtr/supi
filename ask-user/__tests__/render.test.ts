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
