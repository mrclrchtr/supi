import { estimateTokens } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildUserPayload, prepareModelRequest } from "../../src/protocol.ts";
import { IMPROVER_MODEL, makeAssistantMessage } from "../helpers/command-harness.ts";

describe("request instructions", () => {
  const background = { guidance: [], conversation: [] };
  const questionnaire = {
    questions: [{ type: "text" as const, id: "scope", header: "Scope", prompt: "Which file?" }],
  };
  const clarification = {
    questionnaire,
    outcome: { outcome: "needs_discussion" as const, responses: [] },
  };

  it("keeps the first payload data-only and preserves literal text", () => {
    const draft = "Plan only: inspect `src/café.ts` with `rg TODO`. Do not edit.";
    expect(JSON.parse(buildUserPayload(draft, background))).toEqual({
      confirmedDraft: draft,
      background,
    });
  });

  it("keeps the sent prefix and appends the response and submitted clarification", () => {
    const request = prepareModelRequest(IMPROVER_MODEL, "Draft", background);
    const response = makeAssistantMessage({ kind: "clarification", questionnaire });
    const final = prepareModelRequest(IMPROVER_MODEL, "Draft", background, {
      request,
      response,
      clarification,
    });
    expect(final.context.systemPrompt).toBe(request.context.systemPrompt);
    expect(final.context.systemPrompt).toContain("After the user submits clarification");
    expect(request.context.messages).toHaveLength(1);
    expect(final.context.messages.slice(0, 2)).toEqual([...request.context.messages, response]);
    expect(final.context.messages[2]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: JSON.stringify({ clarification }) }],
    });
    expect(final.context).not.toHaveProperty("tools");
  });
});

describe("request token allowance", () => {
  it.each(["A clear draft.", "Fix café text 😀"])(
    "uses Pi estimates for system and user text: %s",
    (draft) => {
      const background = { guidance: [], conversation: [] };
      const model = { ...IMPROVER_MODEL, contextWindow: 100_000, maxTokens: 4096 };
      const prepared = prepareModelRequest(model, draft, background);
      const inputTokens =
        estimateTokens({
          role: "system",
          content: prepared.context.systemPrompt ?? "",
          timestamp: 0,
        }) + prepared.context.messages.reduce((sum, message) => sum + estimateTokens(message), 0);
      const contextWindow = inputTokens + 128 + 4096 + prepared.maxTokens;

      expect(prepareModelRequest({ ...model, contextWindow }, draft, background)).toMatchObject({
        maxTokens: 4096,
        selectedContext: background,
      });
      expect(() =>
        prepareModelRequest({ ...model, contextWindow: contextWindow - 1 }, draft, background),
      ).toThrow("The draft, conversation, and required response do not fit the selected model.");
    },
  );
});
