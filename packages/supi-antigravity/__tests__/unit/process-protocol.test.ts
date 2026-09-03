import { describe, expect, it } from "vitest";
import { AntigravityEventAccumulator } from "../../src/process/events.ts";

describe("Antigravity event protocol", () => {
  it("reduces nested agy step update envelopes", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({
      type: "assistant",
      message: {
        content: [
          {
            event: "step_update",
            step_update: {
              conversation_id: "conversation-nested",
              step_index: 1,
              state: "ACTIVE",
              step_type: "tool",
              tool_name: "read_file",
              tool_info: { parameters: { path: "README.md" } },
            },
          },
          {
            event: "step_update",
            step_update: {
              conversation_id: "conversation-nested",
              step_index: 1,
              state: "PAUSED",
              step_type: "tool",
              tool_name: "read_file",
              reason: "Permission denied",
            },
          },
          {
            event: "step_update",
            step_update: {
              conversation_id: "conversation-nested",
              step_index: 1,
              state: "DONE",
              step_type: "tool",
              tool_name: "read_file",
            },
          },
        ],
      },
    });
    accumulator.consume({
      event: "result",
      result: {
        conversation_id: "conversation-nested",
        status: "SUCCESS",
        structured_output: { answer: "Done.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolNames: ["read_file"],
      successfulToolNames: ["read_file"],
      permissionDenials: 1,
    });
  });

  it("finishes a result after consuming nested tool blocks", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({
      event: "result",
      result: {
        conversation_id: "conversation-result-nested",
        status: "SUCCESS",
        message: {
          content: [
            {
              type: "tool_use",
              id: "nested-result-tool",
              name: "read_file",
              input: { path: "README.md" },
            },
            {
              type: "tool_result",
              tool_use_id: "nested-result-tool",
              status: "success",
            },
          ],
        },
        structured_output: { answer: "Done.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      conversationId: "conversation-result-nested",
      successfulToolNames: ["read_file"],
    });
  });

  it("reduces agy event envelopes and step updates", () => {
    const accumulator = new AntigravityEventAccumulator({ workspaceDirectory: "/workspace" });
    accumulator.consume({ event: "init", conversation_id: "conversation-3" });
    accumulator.consume({
      event: "step_update",
      usage: { input_tokens: 4 },
      step_update: {
        conversation_id: "conversation-3",
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "read_url_content",
        tool_info: { parameters: { url: "not-a-url", link: "https://nodejs.org/docs" } },
      },
    });
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-3",
        step_index: 1,
        state: "DONE",
        step_type: "tool",
        tool_name: "read_url_content",
      },
    });
    accumulator.consume({
      event: "step_update",
      usage: { output_tokens: 6 },
      step_update: {
        conversation_id: "conversation-3",
        step_index: 1,
        state: "DONE",
        step_type: "tool",
        tool_name: "read_url_content",
      },
    });
    accumulator.consume({
      event: "result",
      result: {
        conversation_id: "conversation-3",
        status: "SUCCESS",
        structured_output: {
          answer: "The documentation is available.",
          sources: [{ title: "Node", url: "https://nodejs.org/docs" }],
          workspaceEvidence: [],
        },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      conversationId: "conversation-3",
      observedToolCounts: { read_url_content: 1 },
      successfulToolNames: ["read_url_content"],
      // biome-ignore lint/security/noSecrets: This is a deterministic SHA-256 fixture value.
      observedSourceHashes: ["34b88c90fea2c9a32ff460316a0675a2cee8433252caa3add856cebedd0e7a08"],
      usage: { inputTokens: 4, outputTokens: 6 },
    });
  });

  it("ignores non-tool step updates", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ event: "init", conversation_id: "conversation-6" });
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-6",
        step_index: 1,
        state: "DONE",
        step_type: "agent_response",
        message: { content: "No tool call." },
      },
    });
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-6",
        step_index: 2,
        state: "ERROR",
        step_type: "planning",
        reason: "Permission denied",
      },
    });
    accumulator.consume({
      event: "result",
      result: {
        conversation_id: "conversation-6",
        status: "SUCCESS",
        structured_output: { answer: "Done.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolNames: [],
      successfulToolNames: [],
      permissionDenials: 0,
    });
  });

  it("accepts camelCase step updates and retains start evidence", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversationId: "conversation-7",
        stepIndex: 1,
        state: "ACTIVE",
        stepType: "tool",
        toolName: "read_url_content",
        input: { Url: "https://example.com/docs" },
        toolInfo: { name: "read_url_content" },
      },
    });
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversationId: "conversation-7",
        stepIndex: 1,
        state: "DONE",
        stepType: "tool",
        toolName: "read_url_content",
      },
    });
    accumulator.consume({
      event: "result",
      tokenUsage: { inputTokens: 2, outputTokens: 3 },
      result: {
        conversationId: "conversation-7",
        status: "SUCCESS",
        structuredOutput: { answer: "Done.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      conversationId: "conversation-7",
      observedToolCounts: { read_url_content: 1 },
      successfulToolNames: ["read_url_content"],
      usage: { inputTokens: 2, outputTokens: 3 },
      observedSourceHashes: [expect.any(String)],
    });
  });

  it("recognizes tool-shaped updates without a step type", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversationId: "conversation-8",
        stepIndex: 1,
        state: "ACTIVE",
        toolName: "read_file",
        toolInfo: { input: { path: "README.md" } },
      },
    });
    accumulator.consume({
      event: "step_update",
      step_update: {
        conversationId: "conversation-8",
        stepIndex: 1,
        state: "DONE",
        toolName: "read_file",
      },
    });
    accumulator.consume({
      event: "result",
      result: {
        conversationId: "conversation-8",
        status: "SUCCESS",
        structuredOutput: { answer: "Done.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolNames: ["read_file"],
      observedToolCounts: { read_file: 1 },
      successfulToolNames: ["read_file"],
    });
  });

  it("allows a tool step to retry after a terminal update", () => {
    const accumulator = new AntigravityEventAccumulator();
    const step = (state: string) =>
      accumulator.consume({
        event: "step_update",
        step_update: {
          conversationId: "conversation-9",
          stepIndex: 1,
          state,
          stepType: "tool",
          toolName: "read_file",
          toolInfo: { input: { path: "README.md" } },
        },
      });
    step("ACTIVE");
    step("DONE");
    step("ACTIVE");
    step("DONE");
    accumulator.consume({
      event: "result",
      result: {
        conversationId: "conversation-9",
        status: "SUCCESS",
        structuredOutput: { answer: "Retried.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolCounts: { read_file: 2 },
      successfulToolNames: ["read_file"],
    });
  });
});
