import type { AgentRunMessage } from "@mrclrchtr/supi-agent-runtime/api";
import { describe, expect, it } from "vitest";
import { buildConversationView } from "../../src/tool/conversation-view.ts";

describe("buildConversationView", () => {
  it("skips the first user message (initial prompt) and retains steering messages", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "Initial prompt from parent", timestamp: 0 },
      { role: "assistant", content: [{ type: "text", text: "working…" }], timestamp: 0 },
      { role: "user", content: "steering message", timestamp: 0 },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    expect(view.entries.length).toBe(2);
    expect(view.entries[0].kind).toBe("assistant");
    expect((view.entries[0] as { kind: "assistant"; text: string }).text).toBe("working…");
    expect(view.entries[1].kind).toBe("steering");
  });

  it("retains accepted steering that has not entered the child message list", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "Initial prompt", timestamp: 0 },
      { role: "user", content: "Already queued", timestamp: 0 },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      acceptedSteering: ["Already queued", "Stop checking docs"],
      taskMetadata: { instructions: "do work" },
    });

    expect(view.entries).toEqual([
      { kind: "steering", text: "Already queued" },
      { kind: "steering", text: "Stop checking docs" },
    ]);
  });

  it("excludes thinking content from assistant messages", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "prompt", timestamp: 0 },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "answer" },
        ],
        timestamp: 0,
      },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    expect(view.entries.length).toBe(1);
    expect((view.entries[0] as { kind: "assistant"; text: string }).text).toBe("answer");
  });

  it("builds tool entries with allowlisted summaries and merges tool result status", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "prompt", timestamp: 0 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc1", name: "read", arguments: { path: "/f.txt" } }],
        timestamp: 0,
      },
      {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "read",
        content: [],
        isError: false,
        timestamp: 0,
      },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    expect(view.entries.length).toBe(1);
    const toolEntry = view.entries[0] as { kind: "tool"; summary: string; status: string };
    expect(toolEntry.kind).toBe("tool");
    expect(toolEntry.summary).toBe("read /f.txt");
    expect(toolEntry.status).toBe("completed");
  });

  it("marks tool entries with error status from toolResult", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "prompt", timestamp: 0 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc1", name: "bash", arguments: { command: "fail" } }],
        timestamp: 0,
      },
      {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "bash",
        content: [],
        isError: true,
        timestamp: 0,
      },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    const toolEntry = view.entries[0] as { kind: "tool"; status: string };
    expect(toolEntry.status).toBe("error");
  });

  it("assigns name-only tool entries to unknown tools", () => {
    const messages: AgentRunMessage[] = [
      { role: "user", content: "prompt", timestamp: 0 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc1", name: "custom_unknown", arguments: { x: 1 } }],
        timestamp: 0,
      },
      {
        role: "toolResult",
        toolCallId: "tc1",
        toolName: "custom_unknown",
        content: [],
        isError: false,
        timestamp: 0,
      },
    ];
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    const toolEntry = view.entries[0] as { kind: "tool"; toolName: string; summary?: string };
    expect(toolEntry.toolName).toBe("custom_unknown");
    expect(toolEntry.summary).toBeUndefined();
  });

  it("omits oldest entries when exceeding the entry cap", () => {
    const messages: AgentRunMessage[] = [{ role: "user", content: "prompt", timestamp: 0 }];
    // Add 150 assistant entries to exceed the 100-entry cap.
    for (let i = 0; i < 150; i++) {
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: `msg ${i}` }],
        timestamp: 0,
      });
    }
    const view = buildConversationView({
      taskId: "t1",
      profileId: "explore",
      messages,
      taskMetadata: { instructions: "do work" },
    });
    expect(view.entries.length).toBeLessThanOrEqual(100);
    expect(view.omittedEntryCount).toBe(50);
  });
});
