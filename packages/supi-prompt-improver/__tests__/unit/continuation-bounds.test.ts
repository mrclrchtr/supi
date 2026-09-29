import { estimateTokens } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptImproverContext } from "../../src/context.ts";
import { prepareModelRequest } from "../../src/protocol.ts";
import { IMPROVER_MODEL, makeAssistantMessage } from "../helpers/command-harness.ts";

const questionnaire = {
  questions: [{ type: "text" as const, id: "scope", header: "Scope", prompt: "Which file?" }],
};
const response = makeAssistantMessage({ kind: "clarification", questionnaire });
const outcome = { outcome: "needs_discussion" as const, responses: [] };
const empty = { guidance: [], conversation: [] };

describe("continuation context limits", () => {
  it("counts assistant text, thinking, answers, and comments in the final allowance", () => {
    const model = { ...IMPROVER_MODEL, contextWindow: 100_000, maxTokens: 4096 };
    const draft = "Keep `src/café.ts` unchanged. 😀";
    const request = prepareModelRequest(model, draft, empty);
    const continuation = {
      request,
      response: {
        ...response,
        content: [
          ...response.content,
          { type: "thinking" as const, thinking: "Context ".repeat(800) },
        ],
      },
      clarification: {
        questionnaire,
        outcome: {
          outcome: "submitted" as const,
          comment: "Form comment 😀".repeat(200),
          responses: [
            {
              questionId: "scope",
              questionComment: "Keep this restriction.".repeat(200),
              answer: { kind: "text" as const, answered: true, value: "Answer text.".repeat(200) },
            },
          ],
        },
      },
    };
    const final = prepareModelRequest(model, draft, empty, continuation);
    const inputTokens =
      estimateTokens({
        role: "system",
        content: final.context.systemPrompt ?? "",
        timestamp: 0,
      }) + final.context.messages.reduce((total, message) => total + estimateTokens(message), 0);
    const contextWindow = inputTokens + 128 + 4096 + 4096;

    expect(
      prepareModelRequest({ ...model, contextWindow }, draft, empty, continuation),
    ).toMatchObject({
      maxTokens: 4096,
      selectedContext: empty,
    });
    expect(() =>
      prepareModelRequest(
        { ...model, contextWindow: contextWindow - 1 },
        draft,
        empty,
        continuation,
      ),
    ).toThrow("The draft, conversation, and required response do not fit the selected model.");
  });

  it("drops only complete optional background while preserving both turns and the snapshot", () => {
    const model = { ...IMPROVER_MODEL, contextWindow: 12_096 };
    const background: PromptImproverContext = {
      guidance: [{ path: "CLAUDE.md", content: "G".repeat(5000) }],
      conversation: [
        { role: "user", sourceId: "old", text: "O".repeat(4000) },
        { role: "assistant", sourceId: "new", text: "N".repeat(4000) },
      ],
      summary: { source: "compaction", sourceId: "summary", text: "S".repeat(4000) },
    };
    const snapshot = JSON.stringify(background);
    const draft = "Plan only: keep `src/café.ts` unchanged.";
    const request = prepareModelRequest(model, draft, background);
    const sentPrefix = JSON.stringify(request.context);
    const clarification = { questionnaire, outcome: { ...outcome, comment: "C".repeat(8000) } };
    const final = prepareModelRequest(model, draft, background, {
      request,
      response,
      clarification,
    });

    expect(request.selectedContext).toEqual(background);
    expect(final.selectedContext).toEqual({
      guidance: background.guidance,
      conversation: [background.conversation[1]],
    });
    expect(final.context.messages[0]).toMatchObject({
      content: [
        { text: JSON.stringify({ confirmedDraft: draft, background: final.selectedContext }) },
      ],
    });
    expect(final.context.messages[1]).toEqual(response);
    expect(final.context.messages[2]).toMatchObject({
      content: [{ text: JSON.stringify({ clarification }) }],
    });
    expect(JSON.stringify(request.context)).toBe(sentPrefix);
    expect(JSON.stringify(background)).toBe(snapshot);
  });

  it("does not restore background omitted from the first request", () => {
    const model = { ...IMPROVER_MODEL, contextWindow: 10_000 };
    const background: PromptImproverContext = {
      guidance: [{ path: "CLAUDE.md", content: "G".repeat(5000) }],
      conversation: [
        { role: "user", sourceId: "old", text: "O".repeat(4000) },
        { role: "assistant", sourceId: "new", text: "N".repeat(4000) },
      ],
      summary: { source: "compaction", sourceId: "summary", text: "S".repeat(4000) },
    };
    const snapshot = JSON.stringify(background);
    const draft = "Keep the scope small.";
    const request = prepareModelRequest(model, draft, background);
    const sentPrefix = JSON.stringify(request.context);
    const final = prepareModelRequest(model, draft, background, {
      request,
      response,
      clarification: { questionnaire, outcome },
    });

    expect(request.selectedContext).toEqual({
      guidance: background.guidance,
      conversation: [background.conversation[1]],
    });
    expect(final.selectedContext).toEqual(request.selectedContext);
    expect(final.context.messages[0]).toEqual(request.context.messages[0]);
    expect(final.context.messages).toHaveLength(3);
    expect(JSON.stringify(request.context)).toBe(sentPrefix);
    expect(JSON.stringify(background)).toBe(snapshot);
  });
});
