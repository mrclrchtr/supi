import type { Context } from "@earendil-works/pi-ai";
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
const clarification = {
  kind: "clarification",
  questionnaire: {
    questions: [
      { type: "text", id: "scope", header: "Scope", prompt: "Which file should change?" },
    ],
  },
};

beforeAll(() => initTheme("dark"));
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

describe("improvement conversation limits", () => {
  it("rejects a second clarification without another form or request", async () => {
    const harness = makeHarness({
      captureDebug: true,
      responses: [makeAssistantMessage(clarification), makeAssistantMessage(clarification)],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) submitUnanswered(component);
    });

    await harness.handler("Keep this draft");

    expect(harness.requestContexts).toHaveLength(2);
    expect(harness.interactions).toHaveLength(4);
    expect(harness.getEditorText()).toBe("Keep this draft");
    expect(harness.notifications.at(-1)?.message).toContain("clarification more than once");
    expect(getDebugEvents({ category: "request.failed" }).events[0]?.data).toMatchObject({
      stage: "final",
      reasonCode: "repeated_clarification",
    });
  });

  it("keeps skipped questions unanswered and accepts an unchanged final result", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage(clarification), makeAssistantMessage({ kind: "unchanged" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) submitUnanswered(component);
    });

    await harness.handler("Keep this draft");

    const final = harness.requestContexts[1] as Context;
    expect(final.messages[2]).toMatchObject({
      content: [{ text: expect.stringContaining('"answered":false') }],
    });
    expect(harness.requestContexts).toHaveLength(2);
    expect(harness.getEditorText()).toBe("Keep this draft");
    expect(harness.notifications.at(-1)?.message).toBe("The draft does not need a change.");
    expect(harness.pi.appendEntry).not.toHaveBeenCalled();
    expect(harness.pi.sendMessage).not.toHaveBeenCalled();
  });

  it("does not continue after the user cancels clarification", async () => {
    const harness = makeHarness({ responses: [makeAssistantMessage(clarification)] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) interact(component, "\u001b");
    });

    await harness.handler("Keep this draft");

    expect(harness.requestContexts).toHaveLength(1);
    expect(harness.interactions).toHaveLength(3);
    expect(harness.getEditorText()).toBe("Keep this draft");
    expect(harness.notifications.some((notice) => notice.type === "error")).toBe(false);
  });

  it.each(["editor", "session", "pending work"] as const)(
    "does not continue after %s changes during clarification",
    async (change) => {
      const harness = makeHarness({ responses: [makeAssistantMessage(clarification)] });
      harness.setCustomDriver((component, index) => {
        if (index === 0) interact(component, "\r");
        if (index !== 2) return;
        if (change === "editor") harness.setEditorText("New external draft");
        if (change === "session") harness.replaceSession();
        if (change === "pending work") harness.setPendingMessages(true);
        submitUnanswered(component);
      });

      await harness.handler("Keep this draft");

      expect(harness.requestContexts).toHaveLength(1);
      expect(harness.interactions).toHaveLength(3);
      expect(harness.getEditorText()).toBe(
        change === "editor" ? "New external draft" : "Keep this draft",
      );
      expect(harness.notifications.at(-1)?.message).toContain("newer editor state was kept");
    },
  );

  it("cancels an unsettled second request with the same feature signal", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage(clarification), () => new Promise(() => {})],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) submitUnanswered(component);
      if (index === 3) interact(component, "\u001b");
    });

    await harness.handler("Keep this draft");

    expect(harness.requestContexts).toHaveLength(2);
    expect(harness.requestSignals[1]).toBe(harness.requestSignals[0]);
    expect(harness.requestSignals[1]?.aborted).toBe(true);
    expect(harness.interactions).toHaveLength(4);
    expect(harness.getEditorText()).toBe("Keep this draft");
  });

  it("rejects oversized submitted answers before dispatch without trimming them", async () => {
    const harness = makeHarness({ responses: [makeAssistantMessage(clarification)] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 2) return;
      harness.editors.at(-1)?.setText("Answer 😀".repeat(32_000));
      interact(component, "\t");
      interact(component, "\r");
    });

    await harness.handler("Keep this draft");

    expect(harness.requestContexts).toHaveLength(1);
    expect(harness.interactions).toHaveLength(3);
    expect(harness.getEditorText()).toBe("Keep this draft");
    expect(harness.notifications.at(-1)?.message).toContain("do not fit the selected model");
  });

  it("retains assistant signatures for the provider but not in prepared-request diagnostics", async () => {
    const response = makeAssistantMessage(clarification);
    response.responseId = "provider-response-id";
    response.content = [
      {
        type: "thinking",
        thinking: "One question is needed.",
        thinkingSignature: "private-thinking-signature",
      },
      {
        type: "text",
        text: JSON.stringify(clarification),
        textSignature: "private-text-signature",
      },
    ];
    Object.assign(response.content[1] ?? {}, { providerOnly: "private-provider-field" });
    const harness = makeHarness({
      captureDebug: true,
      responses: [response, makeAssistantMessage({ kind: "unchanged" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) submitUnanswered(component);
    });

    await harness.handler("Keep this draft");

    const final = harness.requestContexts[1] as Context;
    expect(final.messages[1]).toEqual(response);
    const diagnostics = JSON.stringify(getDebugEvents({ source: "prompt-improver" }).events);
    expect(diagnostics).toContain("One question is needed.");
    expect(diagnostics).not.toContain("private-thinking-signature");
    expect(diagnostics).not.toContain("private-text-signature");
    expect(diagnostics).not.toContain("private-provider-field");
    expect(harness.notifications.some((notice) => notice.type === "error")).toBe(false);
  });

  it("starts a new conversation for each command invocation", async () => {
    const harness = makeHarness({});
    harness.setCustomDriver((component, index) => {
      if (index === 0 || index === 2) interact(component, "\r");
    });

    await harness.handler("First draft");
    await harness.handler("Second draft");

    expect(harness.requestContexts).toHaveLength(2);
    const second = harness.requestContexts[1] as Context;
    expect(second.messages).toHaveLength(1);
    expect(JSON.stringify(second)).not.toContain("First draft");
    expect(harness.getEditorText()).toBe("Second draft");
  });
});

function submitUnanswered(component: Parameters<typeof interact>[0]): void {
  interact(component, "\u001bu");
  interact(component, "\t");
  interact(component, "\r");
}

function makeHarness(options: Parameters<typeof createCommandHarness>[0]): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}
