import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  CHILD_LIFECYCLE_TRACE_MAX,
  ChildLifecycleTraceCollector,
} from "../../src/tool/child-lifecycle-trace.ts";

describe("ChildLifecycleTraceCollector", () => {
  it("records terminal lifecycle transitions in observed order", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({ type: "agent_start" } as AgentSessionEvent);
    collector.observe({ type: "agent_end", messages: [], willRetry: true } as AgentSessionEvent);
    collector.observe({ type: "agent_settled" } as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({
      entries: [
        { type: "agent_start" },
        { type: "agent_end", willRetry: true },
        { type: "agent_settled" },
      ],
      droppedCount: 0,
    });
  });

  it("copies compaction facts without retaining the result or error payload", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({
      type: "compaction_end",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      result: { summary: "private compaction summary" },
      errorMessage: "private provider error",
    } as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({
      entries: [
        {
          type: "compaction_end",
          reason: "overflow",
          aborted: false,
          willRetry: true,
          hasResult: true,
          hasError: true,
        },
      ],
      droppedCount: 0,
    });
  });

  it("retains only allowlisted recovery metadata and queue counts", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({ type: "compaction_start", reason: "overflow" } as AgentSessionEvent);
    collector.observe({
      type: "auto_retry_start",
      attempt: 2,
      maxAttempts: 4,
      delayMs: 250,
      errorMessage: "private provider error",
    } as AgentSessionEvent);
    collector.observe({
      type: "auto_retry_end",
      success: false,
      attempt: 2,
      finalError: "private final error",
    } as AgentSessionEvent);
    collector.observe({
      type: "summarization_retry_scheduled",
      attempt: 1,
      maxAttempts: 3,
      delayMs: 100,
      errorMessage: "private summarization error",
    } as AgentSessionEvent);
    collector.observe({
      type: "summarization_retry_attempt_start",
      source: "compaction",
      reason: "threshold",
    } as AgentSessionEvent);
    collector.observe({
      type: "summarization_retry_attempt_start",
      source: "branchSummary",
    } as AgentSessionEvent);
    collector.observe({ type: "summarization_retry_finished" } as AgentSessionEvent);
    collector.observe({
      type: "queue_update",
      steering: ["private steer"],
      followUp: ["private follow-up", "another private follow-up"],
    } as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({
      entries: [
        { type: "compaction_start", reason: "overflow" },
        { type: "auto_retry_start", attempt: 2, maxAttempts: 4, delayMs: 250 },
        { type: "auto_retry_end", success: false, attempt: 2, hasFinalError: true },
        {
          type: "summarization_retry_scheduled",
          attempt: 1,
          maxAttempts: 3,
          delayMs: 100,
        },
        {
          type: "summarization_retry_attempt_start",
          source: "compaction",
          reason: "threshold",
        },
        { type: "summarization_retry_attempt_start", source: "branchSummary" },
        { type: "summarization_retry_finished" },
        { type: "queue_update", steeringCount: 1, followUpCount: 2 },
      ],
      droppedCount: 0,
    });
  });

  it("records runner control markers without arbitrary runner data", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.recordHostMarker({ type: "steer_requested", reason: "submit" });
    collector.recordHostMarker({ type: "timeout_expired" });
    collector.recordHostMarker({ type: "abort_requested", reason: "timeout" });
    collector.recordHostMarker({ type: "prompt_rejected" });

    expect(collector.snapshot()).toEqual({
      entries: [
        { type: "steer_requested", reason: "submit" },
        { type: "timeout_expired" },
        { type: "abort_requested", reason: "timeout" },
        { type: "prompt_rejected" },
      ],
      droppedCount: 0,
    });
  });

  it("copies only allowlisted host-marker fields", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.recordHostMarker({
      type: "abort_requested",
      reason: "timeout",
      privateError: "private host error",
    } as unknown as Parameters<ChildLifecycleTraceCollector["recordHostMarker"]>[0]);

    expect(collector.snapshot()).toEqual({
      entries: [{ type: "abort_requested", reason: "timeout" }],
      droppedCount: 0,
    });
    expect(JSON.stringify(collector.snapshot())).not.toContain("private host error");
  });

  it("keeps the newest observed tail and reports every dropped older entry", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({ type: "agent_start" } as AgentSessionEvent);
    for (let index = 0; index < CHILD_LIFECYCLE_TRACE_MAX + 2; index++) {
      collector.recordHostMarker({ type: "timeout_expired" });
    }

    const trace = collector.snapshot();

    expect(trace.entries).toHaveLength(CHILD_LIFECYCLE_TRACE_MAX);
    expect(trace.entries).toEqual(
      Array.from({ length: CHILD_LIFECYCLE_TRACE_MAX }, () => ({ type: "timeout_expired" })),
    );
    expect(trace.droppedCount).toBe(3);
  });

  it("omits malformed known lifecycle events without throwing", () => {
    const collector = new ChildLifecycleTraceCollector();
    const event = { type: "queue_update", followUp: [] } as Record<string, unknown>;
    Object.defineProperty(event, "steering", {
      get() {
        throw new Error("private queue getter error");
      },
    });

    expect(() => collector.observe(event as unknown as AgentSessionEvent)).not.toThrow();
    expect(collector.snapshot()).toEqual({ entries: [], droppedCount: 0 });
    expect(JSON.stringify(collector.snapshot())).not.toContain("private queue getter error");
  });

  it("omits known lifecycle events with non-allowlisted primitive values", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({
      type: "compaction_start",
      reason: "private_reason",
    } as unknown as AgentSessionEvent);
    collector.observe({
      type: "agent_end",
      messages: [],
      willRetry: "private_retry_value",
    } as unknown as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({ entries: [], droppedCount: 0 });
    expect(JSON.stringify(collector.snapshot())).not.toContain("private_");
  });

  it("ignores unknown lifecycle events", () => {
    const collector = new ChildLifecycleTraceCollector();

    collector.observe({
      type: "future_lifecycle_event",
      errorMessage: "private future error",
      text: "private future text",
    } as unknown as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({ entries: [], droppedCount: 0 });
  });

  it("keeps recent activity separate from lifecycle retention", () => {
    const collector = new ChildLifecycleTraceCollector(new Set(["read_snapshot_diff"]));

    collector.observe({
      type: "message_end",
      message: {
        role: "assistant",
        content: "private assistant text",
        stopReason: "error",
        errorMessage: "private assistant error",
      },
    } as unknown as AgentSessionEvent);
    collector.observe({ type: "turn_start", turnIndex: 1, timestamp: 1 } as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_start",
      toolName: "read_snapshot_diff",
      args: { file: "private/path.ts" },
    } as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_end",
      toolName: "read_snapshot_diff",
      args: { file: "private/path.ts" },
      result: { content: "private tool result" },
      isError: true,
    } as unknown as AgentSessionEvent);
    collector.observe({
      type: "turn_end",
      turnIndex: 1,
      message: {},
      toolResults: [],
    } as unknown as AgentSessionEvent);
    collector.observe({ type: "agent_end", messages: [], willRetry: true } as AgentSessionEvent);

    expect(collector.recentActivitySnapshot()).toEqual([
      "assistant:end:error",
      "turn:start",
      "tool:start:read_snapshot_diff",
      "tool:end:read_snapshot_diff:error",
      "turn:end",
    ]);
    expect(collector.snapshot().entries).toEqual([{ type: "agent_end", willRetry: true }]);
  });

  it("omits unregistered tool names from Recent Activity", () => {
    const collector = new ChildLifecycleTraceCollector(new Set(["read"]));

    collector.observe({
      type: "tool_execution_start",
      toolName: "private_unregistered_tool",
      args: { private: "tool argument" },
    } as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_end",
      toolName: "private_unregistered_tool",
      args: { private: "tool argument" },
      result: { content: "private tool result" },
      isError: true,
    } as unknown as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_start",
      toolName: "read",
      args: {},
    } as AgentSessionEvent);

    expect(collector.recentActivitySnapshot()).toEqual(["tool:start:read"]);
  });

  it("does not let more than ten activity events evict lifecycle evidence", () => {
    const registeredToolNames = new Set(
      Array.from({ length: 12 }, (_value, index) => `tool-${index}`),
    );
    const collector = new ChildLifecycleTraceCollector(registeredToolNames);

    collector.observe({ type: "agent_start" } as AgentSessionEvent);
    for (let index = 0; index < 12; index++) {
      collector.observe({
        type: "tool_execution_start",
        toolName: `tool-${index}`,
        args: { private: "tool argument" },
      } as AgentSessionEvent);
    }
    collector.observe({ type: "agent_settled" } as AgentSessionEvent);

    expect(collector.recentActivitySnapshot()).toHaveLength(10);
    expect(collector.snapshot()).toEqual({
      entries: [{ type: "agent_start" }, { type: "agent_settled" }],
      droppedCount: 0,
    });
  });
});
