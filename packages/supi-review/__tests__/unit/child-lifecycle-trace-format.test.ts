import { describe, expect, it } from "vitest";
import { formatChildLifecycleTrace } from "../../src/tool/child-lifecycle-trace.ts";

describe("formatChildLifecycleTrace", () => {
  it("formats the complete retained trace and calls a truncated tail incomplete", () => {
    const formatted = formatChildLifecycleTrace({
      entries: [
        { type: "agent_start" },
        {
          type: "compaction_end",
          reason: "overflow",
          aborted: false,
          willRetry: true,
          hasResult: false,
          hasError: true,
        },
        { type: "queue_update", steeringCount: 1, followUpCount: 2 },
      ],
      droppedCount: 2,
    });

    expect(formatted).toBe(
      "Child Lifecycle Trace (incomplete observed tail; 2 older entries dropped): " +
        "agent_start → compaction_end(reason=overflow, aborted=false, willRetry=true, " +
        "hasResult=false, hasError=true) → queue_update(steering=1, followUp=2)",
    );
  });

  it("formats every remaining allowlisted retry and runner-control entry", () => {
    const formatted = formatChildLifecycleTrace({
      entries: [
        { type: "agent_end", willRetry: true },
        { type: "agent_settled" },
        { type: "compaction_start", reason: "threshold" },
        { type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 10 },
        { type: "auto_retry_end", success: true, attempt: 1, hasFinalError: false },
        { type: "summarization_retry_scheduled", attempt: 2, maxAttempts: 3, delayMs: 20 },
        {
          type: "summarization_retry_attempt_start",
          source: "compaction",
          reason: "overflow",
        },
        { type: "summarization_retry_attempt_start", source: "branchSummary" },
        { type: "summarization_retry_finished" },
        { type: "timeout_expired" },
        { type: "abort_requested", reason: "canceled" },
        { type: "prompt_rejected" },
      ],
      droppedCount: 0,
    });

    expect(formatted).toContain("agent_end(willRetry=true)");
    expect(formatted).toContain("compaction_start(reason=threshold)");
    expect(formatted).toContain("auto_retry_start(attempt=1/3, delayMs=10)");
    expect(formatted).toContain("auto_retry_end(success=true, attempt=1, hasFinalError=false)");
    expect(formatted).toContain("summarization_retry_scheduled(attempt=2/3, delayMs=20)");
    expect(formatted).toContain(
      "summarization_retry_attempt_start(source=compaction, reason=overflow)",
    );
    expect(formatted).toContain(
      `summarization_retry_attempt_start(source=${"branch" + "Summary"})`,
    );
    expect(formatted).toContain("abort_requested(reason=canceled)");
  });
});
