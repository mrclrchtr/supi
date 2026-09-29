import type { AssistantMessage } from "@earendil-works/pi-ai";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { getDebugEvents, redactDebugData } from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { boundDiagnosticData, PROMPT_IMPROVER_DEBUG_LIMITS } from "../../src/diagnostic-data.ts";
import { capturePromptImproverResponse } from "../../src/diagnostic-snapshot.ts";
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

describe("prompt-improver diagnostic bounds", () => {
  it("preserves shape markers and records only opaque provider argument shapes", () => {
    const unreadable = Proxy.revocable({}, {});
    unreadable.revoke();
    const args = [
      ["string", JSON.stringify({ privateArgument: true })],
      ["number", 7],
      ["boolean", true],
      ["null", null],
      ["array", ["private array item"]],
      ["object", { totalTokens: 12, name: "private object field" }],
      ["unreadable", unreadable.proxy],
    ] as const;
    const response = capturePromptImproverResponse({
      content: [
        { type: "text", text: 17 },
        { type: "text", text: unreadable.proxy },
        {
          type: "toolCall",
          id: { totalTokens: 0 },
          name: { name: { name: "private nested name" } },
          arguments: "private argument text",
        },
        ...args.map(([, value]) => ({ type: "toolCall", arguments: value })),
      ],
    });
    const bounded = boundDiagnosticData({ response }, { sanitizeStrings: true }).value;
    const parts = readArray(readField(readField(bounded, "response"), "content"));

    expect(readField(readField(parts[0], "text"), "shape")).toBe("number");
    expect(readField(readField(parts[1], "text"), "shape")).toBe("unreadable");
    expect(parts[2]).toMatchObject({
      id: { shape: "object" },
      name: { shape: "object" },
      arguments: { shape: "string" },
    });
    for (let index = 0; index < args.length; index += 1) {
      expect(readField(parts[index + 3], "arguments")).toEqual({ shape: args[index]?.[0] });
    }
    expect(JSON.stringify(bounded)).not.toContain("private");

    const ordinary = boundDiagnosticData({
      questionnaire: { title: "Question", questions: [{ id: "q1" }] },
      answers: [{ answer: "yes" }],
    }).value;
    expect(readField(readField(ordinary, "questionnaire"), "shape")).toBeUndefined();
    expect(readField(readArray(readField(ordinary, "answers"))[0], "shape")).toBeUndefined();
  });

  it("keeps saturated provider and trusted nested data stable after registry redaction", async () => {
    const response = makeAssistantMessage({ kind: "unchanged" });
    response.content = [
      { type: "text", text: JSON.stringify({ kind: "unchanged" }) },
      { type: "thinking", thinking: "x".repeat(64_000) },
      { type: "thinking", thinking: "y".repeat(64_000) },
      {
        type: "toolCall",
        id: { totalTokens: 0 },
        name: { name: { name: { name: "nested provider value" } } },
        arguments: { totalTokens: 0 },
      },
    ] as unknown as AssistantMessage["content"];

    const deepValue = nestedName(12);
    const bounded = boundDiagnosticData(
      {
        response: capturePromptImproverResponse(response),
        questionnaire: { title: "Q", questions: [deepValue] },
        answers: [
          { questionId: "q1", answer: deepValue },
          { questionId: "q2", answer: nestedArrays(4) },
        ],
      },
      { sanitizeStrings: true },
    );
    expect(bounded.truncated).toBe(true);
    expect(stringBounds(bounded.value).total).toBeGreaterThan(70_000);
    expect(stringBounds(bounded.value).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
    expect(stringBounds(bounded.value).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(maximumDepth(bounded.value)).toBeLessThan(PROMPT_IMPROVER_DEBUG_LIMITS.depth);
    expect(boundDiagnosticData(bounded.value, { sanitizeStrings: true }).value).toEqual(
      bounded.value,
    );
    expect(redactDebugData(bounded.value)).toEqual(bounded.value);
    expect(redactDebugData(redactDebugData(bounded.value))).toEqual(bounded.value);

    const harness = makeHarness({ persistDebugEvents: true, responses: [response] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });
    await harness.handler("Keep the confirmed draft");

    const event = getDebugEvents({ source: "prompt-improver", category: "request.response" })
      .events[0];
    const eventData = event?.data;
    expect(eventData).toBeDefined();
    expect(readField(eventData, "diagnosticTruncated")).toBe(true);
    expect(stringBounds(eventData).total).toBeGreaterThan(70_000);
    expect(stringBounds(eventData).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
    expect(stringBounds(eventData).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(redactDebugData(eventData)).toEqual(eventData);

    const persistedEvent = harness
      .readPersistedSession()
      .filter((entry) => entry.type === "custom" && entry.customType === "supi-debug-event")
      .map((entry) => entry.data as Record<string, unknown>)
      .find((item) => item.category === "request.response");
    const persistedData = readField(persistedEvent, "data");
    expect(stringBounds(persistedData).total).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.eventStringCodePoints,
    );
    expect(stringBounds(persistedData).max).toBeLessThanOrEqual(
      PROMPT_IMPROVER_DEBUG_LIMITS.stringCodePoints,
    );
    expect(redactDebugData(redactDebugData(persistedData))).toEqual(persistedData);
  });

  it("keeps array caps and omission counts stable through registry and session persistence", async () => {
    const response = makeAssistantMessage({ kind: "unchanged" });
    response.content = [
      ...response.content,
      ...Array.from({ length: 39 }, (_unused, index) => ({
        type: "thinking" as const,
        thinking: `part ${index}`,
      })),
    ] as AssistantMessage["content"];
    const contextFiles = Array.from({ length: 40 }, (_unused, index) => ({
      path: `.pi/guidance-${index}.md`,
      content: `guidance ${index}`,
    }));
    const harness = makeHarness({
      persistDebugEvents: true,
      contextFiles,
      responses: [response],
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });
    await harness.handler("Keep the confirmed draft");

    const contextEvent = getDebugEvents({ source: "prompt-improver", category: "context.snapshot" })
      .events[0];
    const eventGuidance = readArray(
      readField(readField(contextEvent?.data, "background"), "guidance"),
    );
    expect(eventGuidance).toHaveLength(PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems);
    expect(eventGuidance.at(-1)).toBe("[9 items omitted]");

    const responseEvent = getDebugEvents({
      source: "prompt-improver",
      category: "request.response",
    }).events[0];
    const eventParts = readArray(readField(readField(responseEvent?.data, "response"), "content"));
    expect(eventParts).toHaveLength(PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems);
    expect(eventParts.at(-1)).toBe("[9 response parts omitted]");
    expect(responseEvent?.data).toMatchObject({
      diagnosticTruncated: true,
      diagnosticTruncatedPaths: ["$.response.content"],
    });
    const boundedAgain = boundDiagnosticData(responseEvent?.data, { sanitizeStrings: true }).value;
    expect(boundedAgain).toEqual(responseEvent?.data);

    const persisted = harness
      .readPersistedSession()
      .filter((entry) => entry.type === "custom" && entry.customType === "supi-debug-event")
      .map((entry) => entry.data as Record<string, unknown>);
    const storedContext = persisted.find((item) => item.category === "context.snapshot");
    const storedGuidance = readArray(
      readField(readField(readField(storedContext, "data"), "background"), "guidance"),
    );
    expect(storedGuidance).toHaveLength(PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems);
    expect(storedGuidance.at(-1)).toBe("[9 items omitted]");

    const storedResponse = persisted.find((item) => item.category === "request.response");
    const storedParts = readArray(
      readField(readField(readField(storedResponse, "data"), "response"), "content"),
    );
    expect(storedParts).toHaveLength(PROMPT_IMPROVER_DEBUG_LIMITS.arrayItems);
    expect(storedParts.at(-1)).toBe("[9 response parts omitted]");
    const storedData = readField(storedResponse, "data");
    expect(storedData).toMatchObject({ diagnosticTruncated: true });
    expect(redactDebugData(redactDebugData(storedData))).toEqual(storedData);
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nestedName(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = { name: "end" };
  for (let index = 0; index < depth; index += 1) value = { name: value };
  return value;
}

function nestedArrays(depth: number): unknown {
  let value: unknown = ["deep array content"];
  for (let index = 0; index < depth; index += 1) value = [value];
  return value;
}

function maximumDepth(value: unknown, depth = 0): number {
  if (Array.isArray(value)) {
    return Math.max(depth, ...value.map((item) => maximumDepth(item, depth + 1)));
  }
  if (typeof value === "object" && value !== null) {
    return Math.max(depth, ...Object.values(value).map((item) => maximumDepth(item, depth + 1)));
  }
  return depth;
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
