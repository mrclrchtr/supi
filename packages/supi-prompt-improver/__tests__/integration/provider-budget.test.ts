import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptImproverContext } from "../../src/context.ts";
import { prepareModelRequest } from "../../src/protocol.ts";
import { IMPROVER_MODEL, makeAssistantMessage } from "../helpers/command-harness.ts";

describe("Pi continuation output allowance", () => {
  it.each([16_000, 42_000])(
    "keeps the output allowance with recorded usage and %i comment characters",
    async (commentLength) => {
      const model = { ...IMPROVER_MODEL, contextWindow: 20_000 };
      const background: PromptImproverContext = {
        guidance: [{ path: "CLAUDE.md", content: "G".repeat(12_000) }],
        conversation: [
          { role: "user", sourceId: "old", text: "O".repeat(6000) },
          { role: "assistant", sourceId: "new", text: "N".repeat(6000) },
        ],
        summary: { source: "compaction", sourceId: "summary", text: "S".repeat(4000) },
      };
      const draft = "Keep the scope small.";
      const request = prepareModelRequest(model, draft, background);
      const questionnaire = {
        questions: [{ type: "text" as const, id: "scope", header: "Scope", prompt: "Which file?" }],
      };
      const response = makeAssistantMessage({ kind: "clarification", questionnaire });
      response.timestamp = (request.context.messages[0]?.timestamp ?? Date.now()) + 1;
      response.usage = { ...response.usage, input: 15_000, output: 1000, totalTokens: 16_000 };
      const firstSnapshot = JSON.stringify(request);
      const responseSnapshot = JSON.stringify(response);
      const final = prepareModelRequest(model, draft, background, {
        request,
        response,
        clarification: {
          questionnaire,
          outcome: {
            outcome: "needs_discussion",
            responses: [],
            comment: "C".repeat(commentLength),
          },
        },
      });
      const runtime = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        refreshOnCreate: false,
      });
      runtime.registerProvider(model.provider, {
        api: model.api,
        baseUrl: model.baseUrl,
        apiKey: "test-key",
        models: [model],
      });
      let payload: Record<string, unknown> | undefined;
      const completed = await new ModelRegistry(runtime)
        .streamSimple(model, final.context, {
          maxTokens: final.maxTokens,
          onPayload: (value) => {
            payload = value as Record<string, unknown>;
          },
          fetch: async () =>
            new Response(
              'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              { headers: { "content-type": "text/event-stream" } },
            ),
        })
        .result();

      expect(completed.errorMessage).toBeUndefined();
      expect(completed.stopReason).toBe("stop");
      expect(payload?.max_tokens ?? payload?.max_completion_tokens).toBe(2048);
      expect(final.selectedContext).not.toEqual(request.selectedContext);
      expect(JSON.stringify(request)).toBe(firstSnapshot);
      expect(JSON.stringify(response)).toBe(responseSnapshot);
    },
  );
});
