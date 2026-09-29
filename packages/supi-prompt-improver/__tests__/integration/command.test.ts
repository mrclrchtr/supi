import { initTheme } from "@earendil-works/pi-coding-agent";
import { getDebugEvents } from "@mrclrchtr/supi-core/debug";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import extension from "../../src/extension.ts";
import {
  type CommandHarness,
  createCommandHarness,
  IMPROVER_MODEL,
  interact,
  makeAssistantMessage,
} from "../helpers/command-harness.ts";

const harnesses: CommandHarness[] = [];

beforeAll(() => initTheme("dark"));

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

describe("/supi-improve command", () => {
  it("is command-only and warns that command text clears the previous editor draft", async () => {
    const pi = createPiMock();
    extension(pi as never);

    const registered = pi.commands.get("supi-improve") as {
      description: string;
      handler: (args: string, ctx: unknown) => Promise<void>;
    };
    expect(registered.description).toContain("editor");
    expect(registered.description).toContain("clears");

    const notify = vi.fn();
    const custom = vi.fn();
    await registered.handler("", {
      mode: "json",
      hasUI: false,
      ui: { notify, custom },
    });

    expect(custom).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
    expect(pi.on).toHaveBeenCalledWith("agent_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_before_tree", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
  });

  it("keeps shared diagnostics off by default", async () => {
    const harness = makeHarness({ responses: [makeAssistantMessage({ kind: "unchanged" })] });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this draft private");

    expect(getDebugEvents().events).toEqual([]);
    expect(harness.pi.appendEntry).not.toHaveBeenCalled();
  });

  it("records a bounded rejection with a run ID when capture is enabled", async () => {
    const harness = makeHarness({ configuredModel: "disabled", captureDebug: true });

    await harness.handler("Keep this private draft");

    const events = getDebugEvents({ source: "prompt-improver" }).events;
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.category === "invocation")).toMatchObject({
      category: "invocation",
      data: {
        outcome: "rejected",
        reasonCode: "model_disabled",
      },
    });
    expect(events[0]?.data).toHaveProperty("runId");
    expect(events.find((event) => event.category === "run.terminal")?.data).toMatchObject({
      outcome: "rejected",
      reasonCode: "model_disabled",
    });
    expect(JSON.stringify(events)).not.toContain("Keep this private draft");
  });

  it("rejects an unavailable configured model even when it is the current model", async () => {
    const harness = makeHarness();
    harness.ctx.model = IMPROVER_MODEL;
    vi.spyOn(harness.ctx.modelRegistry, "getAvailable").mockReturnValue([]);
    harness.setCustomDriver((component) => interact(component, "\u001b"));

    await harness.handler("Keep the editor unchanged");

    expect(harness.interactions).toHaveLength(0);
    expect(harness.requestContexts).toHaveLength(0);
    expect(harness.getEditorText()).toBe("post-command baseline");
    expect(harness.notifications.at(-1)?.message).toContain("not available");
  });

  it("uses projected string content and omits suppressed raw entries", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "unchanged" })],
      projection: {
        entries: [
          {
            sourceEntry: {
              type: "message",
              id: "string-user",
              message: { role: "user", content: "old raw string" },
            },
            messages: [{ role: "user", content: "projected replacement string" }],
          },
          {
            sourceEntry: {
              type: "message",
              id: "omitted-user",
              message: { role: "user", content: "omitted raw secret" },
            },
            messages: [],
          },
        ],
        messages: [],
      },
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep the string replacement");

    const request = harness.requestContexts[0] as {
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    const payload = request.messages[0]?.content[0]?.text ?? "";
    expect(payload).toContain("projected replacement string");
    expect(payload).not.toContain("old raw string");
    expect(payload).not.toContain("omitted raw secret");
  });

  it("uses only the summary that contributes to the active projection", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "unchanged" })],
      projection: {
        entries: [
          {
            sourceEntry: {
              type: "compaction",
              id: "active-compaction",
              summary: "active current summary",
            },
            messages: [{ role: "compactionSummary", summary: "active current summary" }],
          },
          {
            sourceEntry: {
              type: "compaction",
              id: "suppressed-compaction",
              summary: "older suppressed summary",
            },
            messages: [],
          },
        ],
        messages: [],
      },
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0) interact(component, "\r");
    });

    await harness.handler("Keep this request");

    const request = harness.requestContexts[0] as {
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    const payload = request.messages[0]?.content[0]?.text ?? "";
    expect(payload).toContain("active current summary");
    expect(payload).not.toContain("older suppressed summary");
  });

  it("uses loaded guidance and projected text, then accepts without submitting", async () => {
    const harness = makeHarness({
      responses: [makeAssistantMessage({ kind: "proposal", proposal: "Clarify the parser bug." })],
      contextFiles: [{ path: "/repo/AGENTS.md", content: "Use small changes." }],
      projection: makeProjection(),
      persistDebugEvents: true,
    });
    harness.setCustomDriver((component, index) => {
      if (index === 0 || index === 2) interact(component, "\r");
    });

    await harness.handler("Fix the parser bug");

    const request = harness.requestContexts[0] as {
      systemPrompt: string;
      messages: Array<{ content: Array<{ text: string }> }>;
    };
    const payload = request.messages[0]?.content[0]?.text ?? "";
    expect(payload).toContain("Use small changes.");
    expect(payload).toContain("projected replacement text");
    expect(payload).toContain("assistant claim after edit");
    expect(payload).toContain("branch summary background");
    expect(request.systemPrompt).toContain('"const":"proposal"');
    expect(request.systemPrompt).toContain('"const":"clarification"');
    expect(request.systemPrompt).not.toContain('"maxItems":3');
    expect(request.systemPrompt).toContain('"details"');
    expect(request.systemPrompt).toContain('"recommendation"');
    expect(payload).not.toContain("superseded raw message");
    expect(payload).not.toContain("tool result secret");
    expect(payload).not.toContain("custom payload secret");
    expect(payload).not.toContain("This full prompt must not enter");
    expect(request.systemPrompt).not.toContain("This full prompt must not enter");
    expect(harness.notifications).toContainEqual({
      message: "Proposal accepted into the editor. Review and submit it when ready.",
      type: "info",
    });
    expect(harness.interactions).toHaveLength(3);
    expect(harness.getEditorText()).toBe("Clarify the parser bug.");
    expect(harness.interactions.every((entry) => entry.overlay)).toBe(true);
    const debugEvents = getDebugEvents({ source: "prompt-improver" }).events.reverse();
    const event = (category: string) =>
      debugEvents.find((entry) => entry.category === category)?.data as
        | Record<string, unknown>
        | undefined;
    expect(event("draft.confirmed")).toMatchObject({
      draft: "Fix the parser bug",
      draftCodePoints: 18,
    });
    expect(event("context.snapshot")).toMatchObject({
      background: {
        guidance: [{ path: "/repo/AGENTS.md", content: "Use small changes." }],
        conversation: [
          { text: "projected replacement text" },
          { text: "assistant claim after edit" },
        ],
      },
    });
    const prepared = event("request.prepared") as {
      stage?: string;
      request?: { systemPrompt?: string; messages?: Array<{ content?: Array<{ text?: string }> }> };
    };
    expect(prepared?.stage).toBe("assessment");
    expect(prepared?.request?.systemPrompt).toContain('"const":"proposal"');
    expect(prepared?.request?.messages?.[0]?.content?.[0]?.text).toContain(
      "projected replacement text",
    );
    expect(event("request.response")).toMatchObject({
      stage: "assessment",
      response: { stopReason: "stop" },
    });
    expect(event("proposal.review")).toMatchObject({ outcome: "accepted" });
    expect(event("run.terminal")).toMatchObject({ outcome: "accepted" });
    const persisted = harness
      .readPersistedSession()
      .filter((entry) => entry.type === "custom" && entry.customType === "supi-debug-event")
      .map((entry) => entry.data);
    expect(persisted).toHaveLength(debugEvents.length);
    expect(persisted).toEqual(debugEvents);
    expect(harness.pi.sendMessage).not.toHaveBeenCalled();
  });
});

function makeHarness(options: Parameters<typeof createCommandHarness>[0] = {}): CommandHarness {
  const harness = createCommandHarness(options);
  harnesses.push(harness);
  return harness;
}

function makeProjection() {
  const message = (
    id: string,
    role: "user" | "assistant" | "toolResult",
    raw: string,
    projected: string,
  ) => ({
    sourceEntry: {
      type: "message",
      id,
      message: { role, content: [{ type: "text", text: raw }] },
    },
    messages: [{ role, content: [{ type: "text", text: projected }] }],
  });
  return {
    entries: [
      message("u1", "user", "superseded raw message", "projected replacement text"),
      message("a1", "assistant", "old assistant claim", "assistant claim after edit"),
      message("tool1", "toolResult", "tool result secret", "tool result secret"),
      {
        sourceEntry: { type: "custom_message", id: "custom1", content: "custom payload secret" },
        messages: [{ role: "custom", content: [{ type: "text", text: "custom payload secret" }] }],
      },
      {
        sourceEntry: {
          type: "branch_summary",
          id: "summary1",
          summary: "branch summary background",
        },
        messages: [{ role: "branchSummary", summary: "branch summary background" }],
      },
    ],
    messages: [],
  };
}
