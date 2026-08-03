import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  AGENT_RUN_LIFECYCLE_TRACE_MAX,
  AgentRunLifecycleTraceCollector,
  formatAgentRunDiagnostics,
  formatAgentRunLifecycleTrace,
} from "../../src/api.ts";

describe("AgentRunLifecycleTraceCollector", () => {
  it("keeps only allowlisted lifecycle and registered-tool activity", () => {
    const collector = new AgentRunLifecycleTraceCollector(new Set(["read"]));
    collector.observe({ type: "agent_start" } as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_start",
      toolName: "read",
      args: { private: "argument" },
    } as AgentSessionEvent);
    collector.observe({
      type: "tool_execution_start",
      toolName: "private_tool",
      args: { private: "argument" },
    } as AgentSessionEvent);
    collector.observe({ type: "agent_settled" } as AgentSessionEvent);

    expect(collector.snapshot()).toEqual({
      entries: [{ type: "agent_start" }, { type: "agent_settled" }],
      droppedCount: 0,
    });
    expect(collector.recentActivitySnapshot()).toEqual(["tool:start:read"]);
    expect(JSON.stringify(collector.snapshot())).not.toContain("private");
  });

  it("uses the stable Agent Run prefix for diagnostics and adapter relabeling", () => {
    const trace = { entries: [{ type: "agent_settled" as const }], droppedCount: 0 };
    expect(formatAgentRunLifecycleTrace(trace)).toContain("Agent Run Lifecycle Trace");
    expect(
      formatAgentRunDiagnostics({ lifecycleTrace: trace, turns: 0, toolUses: 0 }).join("\n"),
    ).toContain("Agent Run Lifecycle Trace");
  });

  it("bounds the lifecycle tail and records timeout cancellation markers", () => {
    const collector = new AgentRunLifecycleTraceCollector();
    for (let index = 0; index < AGENT_RUN_LIFECYCLE_TRACE_MAX + 2; index++) {
      collector.recordHostMarker({ type: "timeout_expired" });
    }
    collector.recordHostMarker({ type: "abort_requested", reason: "timeout" });

    const trace = collector.snapshot();
    expect(trace.entries).toHaveLength(AGENT_RUN_LIFECYCLE_TRACE_MAX);
    expect(trace.droppedCount).toBe(3);
    expect(trace.entries.at(-1)).toEqual({ type: "abort_requested", reason: "timeout" });
  });
});
