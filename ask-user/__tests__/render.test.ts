import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderAskUserCall, renderAskUserResult } from "../render.ts";
import { ASK_USER_ERROR_MARKER, buildErrorResult } from "../result.ts";

const theme: Theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `<b>${text}</b>`,
  // biome-ignore lint/suspicious/noExplicitAny: minimal Theme stub for unit tests
} as any;

describe("renderAskUserCall", () => {
  it("renders a count and joined header list", () => {
    const text = renderAskUserCall(
      {
        questions: [
          { type: "choice", id: "scope", header: "Scope" },
          { type: "yesno", id: "go", header: "Go?" },
        ],
      },
      theme,
    );
    const rendered = text.render(120).join("\n");
    expect(rendered).toContain("ask_user");
    expect(rendered).toContain("2 questions");
    expect(rendered).toContain("Scope, Go?");
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
    const r = buildErrorResult("nope");
    expect((r.details as unknown as Record<string, unknown>)[ASK_USER_ERROR_MARKER]).toBe(true);
  });

  it("renders the option label, not the stable value, for choice answers", () => {
    const text = renderAskUserResult(
      {
        details: {
          questions: [
            {
              id: "scope",
              header: "Scope",
              type: "choice",
              prompt: "Pick",
              options: [
                { value: "api_only", label: "API only" },
                { value: "full_rewrite", label: "Full rewrite" },
              ],
              allowOther: false,
              allowComment: false,
            },
          ],
          answers: [{ questionId: "scope", source: "option", value: "api_only", optionIndex: 0 }],
          answersById: {
            scope: { questionId: "scope", source: "option", value: "api_only", optionIndex: 0 },
          },
          terminalState: "submitted",
        },
        content: [{ type: "text", text: "Scope: 1. API only" }],
      },
      theme,
    );
    const rendered = text.render(120).join("");
    expect(rendered).toContain("API only");
    expect(rendered).not.toContain("api_only");
  });
});
