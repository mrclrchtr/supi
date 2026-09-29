import type { AssistantMessage } from "@earendil-works/pi-ai";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { getDebugEvents, redactDebugData } from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { boundDiagnosticData } from "../../src/diagnostic-data.ts";
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

describe("prompt-improver diagnostic safety", () => {
  it.each([false, true])(
    "does not let hostile unused usage change a proposal (capture %s)",
    async (capture) => {
      const usage = Proxy.revocable({}, {});
      usage.revoke();
      const response = makeAssistantMessage({
        kind: "proposal",
        proposal: "Keep the parser small.",
      });
      let usageReads = 0;
      Object.defineProperty(response, "usage", {
        configurable: true,
        get: () => {
          usageReads += 1;
          return usage.proxy;
        },
      });
      const harness = makeHarness({ captureDebug: capture, responses: [response] });
      harness.setCustomDriver((component, index) => {
        if (index === 0 || index === 2) interact(component, "\r");
      });

      await harness.handler("Fix the parser");

      expect(harness.getEditorText()).toBe("Keep the parser small.");
      expect(harness.notifications.some((notice) => notice.type === "error")).toBe(false);
      expect(usageReads).toBe(capture ? 1 : 0);
      if (capture) {
        expect(
          getDebugEvents({ source: "prompt-improver", category: "request.response" }).events[0]
            ?.data,
        ).toMatchObject({ response: { usageShape: "unreadable" } });
      } else {
        expect(getDebugEvents().events).toEqual([]);
      }
    },
  );

  it("ignores a session-ID lookup failure that occurs only during diagnostics setup", async () => {
    const harness = makeHarness({
      captureDebug: true,
      responses: [makeAssistantMessage({ kind: "unchanged" })],
    });
    const manager = harness.ctx.sessionManager;
    const readSessionId = manager.getSessionId.bind(manager);
    vi.spyOn(manager, "getSessionId")
      .mockImplementationOnce(() => {
        throw new Error("The diagnostic session lookup failed.");
      })
      .mockImplementation(readSessionId);
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this confirmed draft");

    expect(harness.getEditorText()).toBe("Keep this confirmed draft");
    expect(harness.notifications.some((notice) => notice.type === "error")).toBe(false);
  });

  it("keeps provider tool arguments opaque and preserves protocol rejection", async () => {
    const ownKeys = vi.fn(() => {
      throw new Error("Provider object enumeration is not allowed.");
    });
    const argumentsObject = new Proxy({}, { ownKeys });
    const response = makeAssistantMessage({ kind: "proposal", proposal: "not used" });
    response.content = [
      { type: "toolCall", id: "call-1", name: "unexpected", arguments: argumentsObject },
    ] as unknown as AssistantMessage["content"];
    const harness = makeHarness({ captureDebug: true, responses: [response] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep the original");

    expect(ownKeys).not.toHaveBeenCalled();
    expect(harness.getEditorText()).toBe("Keep the original");
    expect(harness.notifications.some((notice) => notice.message.includes("tool call"))).toBe(true);
    const completion = getDebugEvents({ source: "prompt-improver", category: "request.response" })
      .events[0];
    expect(completion?.data).toMatchObject({
      response: {
        content: [{ type: "toolCall", arguments: { shape: "object" } }],
      },
    });
    expect(
      getDebugEvents({ source: "prompt-improver", category: "request.failed" }).events[0]?.data,
    ).toMatchObject({ reasonCode: "unexpected_tool_call", stage: "assessment" });
    expect(JSON.stringify(completion?.data)).not.toContain("Provider object enumeration");
  });

  it.each([0, 1])("keeps response text at the exact code-point boundary (+%s)", async (extra) => {
    const limit = PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints;
    const response = makeMessageWithTextLength(limit + extra);
    const harness = makeHarness({ captureDebug: true, responses: [response] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) interact(component, "\u001b");
    });

    await harness.handler("Keep this draft");

    const event = getDebugEvents({ source: "prompt-improver", category: "request.response" })
      .events[0];
    const responseData = readField(event?.data, "response");
    const content = readField(responseData, "content");
    const part = Array.isArray(content) ? content[0] : undefined;
    const text = readStringField(part, "text");
    expect(Array.from(text).length).toBe(limit);
    expect(readField(event?.data, "diagnosticTruncated") === true).toBe(extra === 1);
  });

  it("applies exact Unicode string caps and stops at a zero event budget", () => {
    const limit = PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints;
    const exact = boundDiagnosticData({ proposal: "😀".repeat(limit) });
    const over = boundDiagnosticData({ proposal: "😀".repeat(limit + 1) });
    const zeroBudget = boundDiagnosticData({
      proposal: "a".repeat(limit),
      draft: "b".repeat(limit),
      message: "x",
    });

    expect(Array.from(readStringField(exact.value, "proposal")).length).toBe(limit);
    expect(exact.truncated).toBe(false);
    expect(Array.from(readStringField(over.value, "proposal")).length).toBe(limit);
    expect(over.truncated).toBe(true);
    expect(over.paths).toContain("$.proposal");
    expect(readField(zeroBudget.value, "message")).toBe("");
    expect(zeroBudget.paths).toContain("$.message");
  });

  it("keeps redacted multipart response data bounded in the registry and session", async () => {
    const privateText = "token=x ".repeat(6_000);
    const response = makeAssistantMessage({ kind: "proposal", proposal: "Use the parser." });
    response.content = [
      ...response.content,
      { type: "thinking", thinking: privateText },
    ] as AssistantMessage["content"];
    const harness = makeHarness({
      captureDebug: true,
      persistDebugEvents: true,
      responses: [response],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index === 2) interact(component, "\u001b");
    });

    await harness.handler("Keep this draft");

    const event = getDebugEvents({ source: "prompt-improver", category: "request.response" })
      .events[0];
    const eventData = event?.data;
    expect(eventData).toBeDefined();
    expect(stringBounds(eventData).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(stringBounds(eventData).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
    expect(JSON.stringify(eventData)).not.toContain("token=x");

    const terminal = getDebugEvents({ source: "prompt-improver", category: "run.terminal" })
      .events[0];
    const runId = readField(terminal?.data, "runId");
    expect(typeof runId).toBe("string");
    expect(
      getDebugEvents({ source: "prompt-improver" })
        .events.filter((item) => readField(item.data, "diagnosticTruncated") === true)
        .every((item) => readField(item.data, "runId") === runId),
    ).toBe(true);

    const persisted = harness
      .readPersistedSession()
      .filter((entry) => entry.type === "custom" && entry.customType === "supi-debug-event")
      .map((entry) => entry.data as Record<string, unknown>)
      .find((item) => item.category === "request.response");
    expect(persisted).toBeDefined();
    const persistedData = readField(persisted, "data");
    expect(stringBounds(persistedData).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(stringBounds(persistedData).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
    const repeatedRedaction = redactDebugData(redactDebugData(persistedData));
    expect(stringBounds(repeatedRedaction).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(stringBounds(repeatedRedaction).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
  });

  it("retains correlation for a truncated provider error", async () => {
    const error = new Error("provider failure ".repeat(5_000));
    const harness = makeHarness({ captureDebug: true, responses: [() => Promise.reject(error)] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this draft");

    const failure = getDebugEvents({ source: "prompt-improver", category: "request.failed" })
      .events[0];
    const terminal = getDebugEvents({ source: "prompt-improver", category: "run.terminal" })
      .events[0];
    expect(readField(failure?.data, "diagnosticTruncated")).toBe(true);
    expect(failure?.data).toMatchObject({ stage: "assessment", reasonCode: "provider_error" });
    expect(readField(failure?.data, "runId")).toBe(readField(terminal?.data, "runId"));
    expect(stringBounds(failure?.data).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(stringBounds(failure?.data).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
  });

  it("does not log old run data after session_start", async () => {
    let resolveRequest!: (message: AssistantMessage) => void;
    const pending = new Promise<AssistantMessage>((resolve) => {
      resolveRequest = resolve;
    });
    const harness = makeHarness({ persistDebugEvents: true, responses: [() => pending] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
      if (index !== 1) return;
      harness.replaceSession();
      void harness.pi.emit("session_start", {});
    });

    await harness.handler("Keep this draft");
    const beforeResult = getDebugEvents({ source: "prompt-improver" }).events;
    expect(beforeResult.some((event) => event.category === "run.terminal")).toBe(false);
    expect(beforeResult.some((event) => event.category === "request.cancelled")).toBe(false);
    resolveRequest(makeAssistantMessage({ kind: "proposal", proposal: "Late proposal" }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(getDebugEvents({ source: "prompt-improver" }).events).toEqual(beforeResult);
    expect(
      harness
        .readPersistedSession()
        .some((entry) => entry.type === "custom" && entry.customType === "supi-debug-event"),
    ).toBe(false);
  });
});

function makeHarness(options: Parameters<typeof createCommandHarness>[0] = {}): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, key);
}

function makeMessageWithTextLength(length: number): AssistantMessage {
  const prefix = JSON.stringify({ kind: "proposal", proposal: "" });
  const response = makeAssistantMessage({
    kind: "proposal",
    proposal: "P".repeat(length - prefix.length),
  });
  response.content = [
    {
      type: "text",
      text: JSON.stringify({ kind: "proposal", proposal: "P".repeat(length - prefix.length) }),
    },
  ];
  return response;
}

function readStringField(value: unknown, key: string): string {
  const field = readField(value, key);
  return typeof field === "string" ? field : "";
}

function stringBounds(value: unknown): { max: number; total: number } {
  let max = 0;
  let total = 0;
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      const length = Array.from(item).length;
      max = Math.max(max, length);
      total += length;
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (typeof item === "object" && item !== null) {
      for (const child of Object.values(item)) visit(child);
    }
  };
  visit(value);
  return { max, total };
}
