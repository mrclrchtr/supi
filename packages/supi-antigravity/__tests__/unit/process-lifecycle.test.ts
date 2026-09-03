import { describe, expect, it } from "vitest";
import { AntigravityEventAccumulator } from "../../src/process/events.ts";

describe("Antigravity event lifecycle", () => {
  it("does not treat canceled or failed tool steps as successful", () => {
    const canceled = new AntigravityEventAccumulator();
    canceled.consume({ event: "init", conversation_id: "conversation-4" });
    canceled.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-4",
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "read_url_content",
        tool_info: { parameters: { Url: "https://example.com" } },
      },
    });
    canceled.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-4",
        step_index: 1,
        state: "PAUSED",
        step_type: "tool",
        tool_name: "read_url_content",
        reason: "Permission denied",
      },
    });
    canceled.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-4",
        step_index: 1,
        state: "PAUSED",
        step_type: "tool",
        tool_name: "read_url_content",
        reason: "Permission denied",
      },
    });
    canceled.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-4",
        step_index: 1,
        state: "RUNNING",
        step_type: "tool",
        tool_name: "read_url_content",
        tool_info: { parameters: { Url: "https://example.com" } },
      },
    });
    canceled.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-4",
        step_index: 1,
        state: "CANCELLED",
        step_type: "tool",
        tool_name: "read_url_content",
      },
    });
    canceled.consume({
      event: "result",
      result: {
        conversation_id: "conversation-4",
        status: "SUCCESS",
        structured_output: { answer: "Canceled.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(canceled.finish()).toMatchObject({
      observedToolNames: ["read_url_content"],
      observedToolCounts: { read_url_content: 1 },
      successfulToolNames: [],
      permissionDenials: 1,
      observedSourceHashes: [],
    });

    const failed = new AntigravityEventAccumulator();
    failed.consume({ event: "init", conversation_id: "conversation-5" });
    failed.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-5",
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "write_file",
        reason: "Permission denied",
        tool_info: { parameters: { path: "README.md" } },
      },
    });
    failed.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-5",
        step_index: 1,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "write_file",
        reason: "Permission denied",
        tool_info: { parameters: { path: "README.md" } },
      },
    });
    failed.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-5",
        step_index: 1,
        state: "ERROR",
        step_type: "tool",
        tool_name: "write_file",
        tool_info: { error: { message: "Permission denied" } },
      },
    });
    failed.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-5",
        step_index: 1,
        state: "ERROR",
        step_type: "tool",
        tool_name: "write_file",
        tool_info: { error: { message: "Permission denied" } },
      },
    });
    failed.consume({
      event: "result",
      result: {
        conversation_id: "conversation-5",
        status: "SUCCESS",
        structured_output: { answer: "Denied.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(failed.finish()).toMatchObject({
      observedToolCounts: { write_file: 1 },
      permissionDenials: 1,
      successfulToolNames: [],
    });

    const timed = new AntigravityEventAccumulator();
    timed.consume({ event: "init", conversation_id: "conversation-10" });
    timed.consume({
      event: "step_update",
      step_update: {
        conversation_id: "conversation-10",
        step_index: 1,
        state: "TIMEOUT",
        step_type: "tool",
        tool_name: "read_file",
      },
    });
    timed.consume({
      event: "result",
      result: {
        conversation_id: "conversation-10",
        status: "SUCCESS",
        structured_output: { answer: "Timed out.", sources: [], workspaceEvidence: [] },
      },
    });
    expect(timed.finish()).toMatchObject({
      observedToolNames: ["read_file"],
      successfulToolNames: [],
    });
  });

  it("deduplicates pending tool results with an ID", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ type: "system", session_id: "conversation-pending" });
    const pending = {
      type: "tool_result",
      id: "tool-pending",
      name: "read_file",
      status: "in_progress",
    };
    accumulator.consume(pending);
    accumulator.consume(pending);
    accumulator.consume({
      type: "tool_result",
      id: "tool-pending",
      name: "read_file",
      status: "success",
      input: { path: "README.md" },
    });
    accumulator.consume({
      type: "result",
      status: "success",
      session_id: "conversation-pending",
      result: { answer: "Done.", sources: [], workspaceEvidence: [] },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolCounts: { read_file: 1 },
      successfulToolNames: ["read_file"],
    });
  });

  it("bounds completed tool ID tracking", () => {
    const accumulator = new AntigravityEventAccumulator();
    accumulator.consume({ type: "system", session_id: "conversation-bounded" });
    for (let index = 0; index < 4_097; index += 1) {
      const id = `tool-${index}`;
      accumulator.consume({ type: "tool_use", id, name: "read_file" });
      accumulator.consume({ type: "tool_result", tool_use_id: id, status: "success" });
    }
    accumulator.consume({
      type: "tool_result",
      tool_use_id: "tool-0",
      name: "read_file",
      status: "success",
    });
    accumulator.consume({
      type: "result",
      status: "success",
      session_id: "conversation-bounded",
      result: { answer: "Done.", sources: [], workspaceEvidence: [] },
    });
    expect(accumulator.finish()).toMatchObject({
      observedToolCounts: { read_file: 4_098 },
      successfulToolNames: ["read_file"],
    });
  });
});
