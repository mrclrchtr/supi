import type { AssistantMessage } from "@earendil-works/pi-ai";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { getDebugEvents } from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PROMPT_IMPROVER_DEBUG_LIMITS } from "../../src/diagnostics.ts";
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

describe("prompt-improver diagnostics", () => {
  it("records provider error text and cause details through sanitized session entries", async () => {
    const providerError = new Error("authorization: Bearer private-key");
    providerError.name = "ProviderFailure";
    Object.assign(providerError, { code: "E_PROXY", status: 502 });
    Object.defineProperty(providerError, "cause", {
      value: new Error("API_KEY=child-token"),
    });
    const harness = makeHarness({
      persistDebugEvents: true,
      responses: [() => Promise.reject(providerError)],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this confirmed draft");

    const failure = getDebugEvents({ source: "prompt-improver", category: "request.failed" })
      .events[0];
    expect(failure?.data).toMatchObject({
      reasonCode: "provider_error",
      error: {
        name: "ProviderFailure",
        code: "E_PROXY",
        status: 502,
        cause: { message: "API_KEY=[REDACTED]" },
      },
    });
    const serialized = JSON.stringify(failure?.data);
    expect(serialized).toContain("authorization: [REDACTED]");
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("child-token");
    expect(failure).not.toHaveProperty("rawData");

    const persisted = harness
      .readPersistedSession()
      .filter((entry) => entry.type === "custom" && entry.customType === "supi-debug-event")
      .map((entry) => entry.data as Record<string, unknown>);
    expect(persisted.some((event) => event.category === "request.failed")).toBe(true);
  });

  it("keeps draft content in sanitized data and honors raw-access denial", async () => {
    const harness = makeHarness({
      captureDebug: true,
      responses: [makeAssistantMessage({ kind: "unchanged" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });
    await harness.handler("Authorization: Bearer private-auth api_key=private-key");

    const event = getDebugEvents({ source: "prompt-improver", category: "draft.confirmed" })
      .events[0];
    expect(event?.data).toMatchObject({
      draft: "Authorization: [REDACTED] api_key=[REDACTED]",
    });
    expect(getDebugEvents({ includeRaw: true, allowRaw: true })).toMatchObject({
      rawAccessDenied: true,
    });
    expect(event).not.toHaveProperty("rawData");
  });

  it.each(["error", "aborted"] as const)(
    "records the %s completion snapshot before protocol rejection",
    async (stopReason) => {
      const harness = makeHarness({
        captureDebug: true,
        responses: [
          makeAssistantMessage({ kind: "proposal", proposal: "No proposal" }, stopReason),
        ],
      });
      harness.setCustomDriver((component, index) => {
        if (index === 0) interact(component, "\r");
      });

      await harness.handler("Keep this draft");

      const response = getDebugEvents({ source: "prompt-improver", category: "request.response" })
        .events[0];
      expect(response?.data).toMatchObject({
        stage: "assessment",
        response: {
          stopReason,
          usage: { input: 10, output: 10, totalUsageUnits: 20 },
          content: [{ type: "text" }],
        },
      });
      expect(
        getDebugEvents({ source: "prompt-improver", category: "request.failed" }).events[0]?.data,
      ).toMatchObject({ reasonCode: `completion_${stopReason}` });
    },
  );

  it.each(["branch", "session"] as const)(
    "rejects a proposal after a real %s identity change while ignoring debug entries",
    async (change) => {
      const harness = makeHarness({
        persistDebugEvents: true,
        responses: [makeAssistantMessage({ kind: "proposal", proposal: "Stale proposal" })],
      });
      const originalSession = harness.getSessionManager();
      harness.setCustomDriver((component, index) => {
        if (index === 0) interact(component, "\r");
        if (index !== 2) return;
        if (change === "branch") harness.appendRealSessionEntry();
        else harness.replaceSession();
        interact(component, "\r");
      });

      await harness.handler("Keep this confirmed draft");

      expect(harness.getEditorText()).toBe("Keep this confirmed draft");
      const reviewEvents = getDebugEvents({
        source: "prompt-improver",
        category: "proposal.review",
      }).events;
      if (change === "branch") {
        expect(reviewEvents[0]?.data).toMatchObject({
          outcome: "stale",
          reasonCode: "branch_changed",
        });
      } else {
        expect(reviewEvents).toEqual([]);
        expect(
          getDebugEvents({ source: "prompt-improver", category: "run.terminal" }).events,
        ).toEqual([]);
        expect(
          harness
            .readPersistedSession()
            .some((entry) => entry.type === "custom" && entry.customType === "supi-debug-event"),
        ).toBe(false);
        expect(
          harness
            .readPersistedSession(originalSession)
            .some((entry) => entry.type === "custom" && entry.customType === "supi-debug-event"),
        ).toBe(true);
      }
    },
  );

  it.each([
    ["editor", "editor_changed"],
    ["pending work", "pending_messages"],
  ] as const)("still rejects a proposal after %s changes", async (change, reasonCode) => {
    const harness = makeHarness({
      persistDebugEvents: true,
      responses: [makeAssistantMessage({ kind: "proposal", proposal: "Stale proposal" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 2) return;
      if (change === "editor") harness.setEditorText("New external draft");
      else harness.setPendingMessages(true);
      interact(component, "\r");
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.getEditorText()).toBe(
      change === "editor" ? "New external draft" : "Keep this confirmed draft",
    );
    expect(
      getDebugEvents({ source: "prompt-improver", category: "proposal.review" }).events[0]?.data,
    ).toMatchObject({ outcome: "stale", reasonCode });
  });

  it("records cancellation before a same-session lifecycle event aborts review", async () => {
    const harness = makeHarness({
      persistDebugEvents: true,
      responses: [makeAssistantMessage({ kind: "proposal", proposal: "Do not apply" })],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) void harness.pi.emit("agent_start", {});
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(
      getDebugEvents({ source: "prompt-improver", category: "run.terminal" }).events[0]?.data,
    ).toMatchObject({ outcome: "cancelled", reasonCode: "agent_started" });
  });

  it("does not record a late provider result after cancellation or session replacement", async () => {
    let resolveRequest!: (message: AssistantMessage) => void;
    const lateRequest = new Promise<AssistantMessage>((resolve) => {
      resolveRequest = resolve;
    });
    const harness = makeHarness({ persistDebugEvents: true, responses: [() => lateRequest] });
    let originalSession = harness.getSessionManager();
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 1) return;
      originalSession = harness.getSessionManager();
      void harness.pi.emit("session_before_switch", {});
      harness.replaceSession();
    });

    await harness.handler("Keep this confirmed draft");
    const priorEvents = getDebugEvents({ source: "prompt-improver" }).events;
    expect(priorEvents.some((event) => event.category === "request.cancelled")).toBe(false);
    expect(priorEvents.some((event) => event.category === "request.response")).toBe(false);
    expect(priorEvents.find((event) => event.category === "run.terminal")?.data).toMatchObject({
      outcome: "cancelled",
      reasonCode: "session_switch",
    });

    resolveRequest(makeAssistantMessage({ kind: "proposal", proposal: "Late proposal" }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(getDebugEvents({ source: "prompt-improver" }).events).toEqual(priorEvents);
    expect(
      harness
        .readPersistedSession(originalSession)
        .some((entry) => entry.type === "custom" && entry.customType === "supi-debug-event"),
    ).toBe(true);
    expect(
      harness
        .readPersistedSession()
        .some((entry) => entry.type === "custom" && entry.customType === "supi-debug-event"),
    ).toBe(false);
  });

  it("bounds long captured responses and keeps an immutable response snapshot", async () => {
    const proposal = "P".repeat(PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints + 100);
    const response = makeAssistantMessage({ kind: "proposal", proposal });
    const harness = makeHarness({ captureDebug: true, responses: [response] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) interact(component, "\u001b");
    });

    await harness.handler("Keep this draft");
    const responseEvent = getDebugEvents({
      source: "prompt-improver",
      category: "request.response",
    }).events[0];
    const data = responseEvent?.data as {
      diagnosticTruncated?: boolean;
      diagnosticTruncatedPaths?: string[];
      response?: { content?: Array<{ text?: string }> };
    };
    expect(data.diagnosticTruncated).toBe(true);
    expect(data.diagnosticTruncatedPaths).toContain("$.response.content[0].text");
    expect(Array.from(data.response?.content?.[0]?.text ?? "").length).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );

    response.content[0] = { type: "text", text: "mutated after completion" };
    expect(
      JSON.stringify(
        getDebugEvents({ source: "prompt-improver", category: "request.response" }).events[0],
      ),
    ).not.toContain("mutated after completion");
  });

  it("records malformed completion shape and usage without losing the response event", async () => {
    const malformed = {
      role: "assistant",
      content: "not a text-content array",
      stopReason: "stop",
      usage: { input: 4, output: 3, totalTokens: 7 },
    } as unknown as AssistantMessage;
    const harness = makeHarness({ captureDebug: true, responses: [malformed] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this draft");

    expect(
      getDebugEvents({ source: "prompt-improver", category: "request.response" }).events[0]?.data,
    ).toMatchObject({
      response: {
        content: [{ type: "string", text: "not a text-content array" }],
        usage: { input: 4, output: 3, totalUsageUnits: 7 },
      },
    });
    expect(
      getDebugEvents({ source: "prompt-improver", category: "request.failed" }).events[0]?.data,
    ).toMatchObject({ reasonCode: "malformed_completion" });
  });
});

function makeHarness(options: Parameters<typeof createCommandHarness>[0] = {}): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}
