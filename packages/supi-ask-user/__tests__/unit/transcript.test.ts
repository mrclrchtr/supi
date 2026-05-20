import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { renderAskUserCall, renderAskUserResult } from "../../src/render/transcript.ts";
import type { AskUserToolDetails } from "../../src/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

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

  it("renders submitted answers", () => {
    const component = renderAskUserResult(
      {
        content: [{ type: "text", text: "Formatter: Biome" }],
        details: {
          title: "Formatter decision",
          questions: [
            {
              type: "choice",
              id: "formatter",
              header: "Formatter",
              prompt: "Pick one",
              required: true,
              options: [
                { value: "biome", label: "Biome" },
                { value: "prettier", label: "Prettier" },
              ],
              multi: false,
              allowOther: false,
              recommendedIndexes: [],
              initialIndexes: [],
            },
          ],
          status: "submitted",
          answersById: {
            formatter: {
              kind: "choice",
              selections: [{ value: "biome", label: "Biome" }],
            },
          },
          missingQuestionIds: [],
        } satisfies AskUserToolDetails,
      },
      theme,
    );

    expect(component.render(120).join("\n")).toContain("Formatter: Biome");
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
