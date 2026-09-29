import { initTheme } from "@earendil-works/pi-coding-agent";
import { getDebugEvents } from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  type CommandHarness,
  createCommandHarness,
  interact,
  makeAssistantMessage,
} from "../helpers/command-harness.ts";

const harnesses: CommandHarness[] = [];

beforeAll(() => initTheme("dark"));
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

describe("prompt clarification", () => {
  it("continues one conversation with the reviewed questionnaire and full outcome", async () => {
    const harness = createCommandHarness({
      persistDebugEvents: true,
      responses: [
        makeAssistantMessage({
          kind: "clarification",
          questionnaire: {
            title: "Choose a color",
            intro: "The draft does not say which theme you prefer.",
            questions: [
              {
                type: "choice",
                id: "theme",
                header: "Theme",
                prompt: "Which theme should the request name?",
                options: [
                  {
                    value: "dark",
                    label: "Dark",
                    description: "Low light output",
                    details: "Useful in a dim room.",
                  },
                  { value: "light", label: "Light" },
                ],
                recommendation: "dark",
              },
              {
                type: "choice",
                id: "contrast",
                header: "Contrast",
                prompt: "Which contrast level should it use?",
                options: [
                  { value: "standard", label: "Standard" },
                  { value: "high", label: "High" },
                ],
              },
            ],
          },
        }),
        makeAssistantMessage({
          kind: "proposal",
          proposal: "Choose a theme, but keep contrast open.",
        }),
      ],
    });
    harnesses.push(harness);
    harness.setCustomDriver((component, index) => {
      if (index === 0) {
        interact(component, "\r");
        return;
      }
      if (index === 2) {
        interact(component, "\r");
        interact(component, "c");
        harness.editors.at(-1)?.setText("Let the user choose later.");
        interact(component, "\r");
        interact(component, "n");
        harness.editors.at(-1)?.setText("Do not force high contrast.");
        interact(component, "\r");
        interact(component, "u");
        interact(component, "\t");
        interact(component, "c");
        harness.editors.at(-1)?.setText("I have no fixed preference.");
        interact(component, "\r");
        interact(component, "\r");
        return;
      }
      if (index === 4) interact(component, "\r");
    });

    await harness.handler("Choose a theme");

    expect(harness.requestContexts).toHaveLength(2);
    const assessment = harness.requestContexts[0] as {
      systemPrompt: string;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
    };
    expect(assessment.systemPrompt).toContain('"const":"clarification"');
    expect(assessment.systemPrompt).not.toContain('"maxItems":3');
    expect(assessment.systemPrompt).toContain('"details"');
    expect(assessment.systemPrompt).toContain('"recommendation"');

    const finalRequest = harness.requestContexts[1] as {
      systemPrompt: string;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
    };
    expect(finalRequest.systemPrompt).toBe(assessment.systemPrompt);
    expect(assessment.messages).toHaveLength(1);
    expect(finalRequest.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(finalRequest.messages[0]).toEqual(assessment.messages[0]);
    expect(finalRequest.messages[1]?.content[0]?.text).toContain('"kind":"clarification"');
    const finalPayload = JSON.parse(finalRequest.messages[2]?.content[0]?.text ?? "{}") as {
      clarification: {
        questionnaire: { questions: Array<{ options?: Array<{ details?: string }> }> };
        outcome: {
          outcome: string;
          comment?: string;
          responses: Array<{
            questionId: string;
            questionComment?: string;
            answer: {
              answered: boolean;
              options?: Array<{ value: string; selected: boolean; comment?: string }>;
            };
          }>;
        };
      };
    };
    expect(finalRequest.systemPrompt).toContain('"const":"clarification"');
    expect(finalRequest.systemPrompt).toContain('"const":"proposal"');
    expect(finalPayload.clarification.questionnaire.questions[0]?.options?.[0]?.details).toBe(
      "Useful in a dim room.",
    );
    expect(finalPayload.clarification.outcome.outcome).toBe("needs_discussion");
    expect(finalPayload.clarification.outcome.comment).toBe("I have no fixed preference.");
    expect(finalPayload.clarification.outcome.responses[0]).toMatchObject({
      questionId: "theme",
      answer: { answered: true, options: [{ value: "dark", selected: true }] },
    });
    expect(finalPayload.clarification.outcome.responses[1]).toMatchObject({
      questionId: "contrast",
      questionComment: "Let the user choose later.",
      answer: {
        answered: false,
        options: [{ value: "standard", selected: false, comment: "Do not force high contrast." }],
      },
    });
    expect(finalRequest.systemPrompt).toContain("Leave unanswered points uncertain.");
    expect(finalRequest.systemPrompt).toContain("Do not ask further questions.");
    expect(Object.keys(finalPayload)).toEqual(["clarification"]);
    expect(harness.getEditorText()).toBe("Choose a theme, but keep contrast open.");
    expect(harness.getEditorText()).not.toContain("TODO");
    expect(harness.interactions.every((entry) => entry.overlay)).toBe(true);

    const events = getDebugEvents({ source: "prompt-improver" }).events;
    const event = (category: string, stage?: string) =>
      events.find(
        (item) =>
          item.category === category &&
          (!stage || (item.data as Record<string, unknown> | undefined)?.stage === stage),
      )?.data as Record<string, unknown> | undefined;
    expect(event("request.prepared", "final")).toMatchObject({
      modelId: expect.stringContaining("test-provider/"),
      reduction: {
        droppedGuidanceFiles: 0,
        droppedConversationMessages: 0,
        summaryDropped: false,
      },
    });
    const clarificationResult = event("clarification.result") as {
      questionnaire?: unknown;
      answers?: { outcome?: string; comment?: string; responses?: Array<Record<string, unknown>> };
    };
    expect(clarificationResult?.questionnaire).toMatchObject({ title: "Choose a color" });
    expect(clarificationResult?.answers).toMatchObject({
      outcome: "needs_discussion",
      comment: "I have no fixed preference.",
      responses: [
        { questionId: "theme", answer: { answered: true } },
        {
          questionId: "contrast",
          questionComment: "Let the user choose later.",
          answer: {
            answered: false,
            options: [
              { value: "standard", selected: false, comment: "Do not force high contrast." },
            ],
          },
        },
      ],
    });
    expect(event("request.response", "assessment")).toHaveProperty("response.usage.input", 10);
    const finalPrepared = event("request.prepared", "final")?.request as {
      messages?: Array<{ content?: Array<{ text?: string }> }>;
    };
    expect(finalPrepared.messages?.[2]?.content?.[0]?.text).toContain(
      "I have no fixed preference.",
    );
    expect(finalPrepared.messages?.[2]?.content?.[0]?.text).toContain(
      "Do not force high contrast.",
    );
    expect(events.every((item) => !("rawData" in item))).toBe(true);
  });
});
