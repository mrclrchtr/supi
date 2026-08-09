import { describe, expect, it } from "vitest";
import { AgentRunTelemetry } from "../../src/tool/run-telemetry.ts";

describe("AgentRunTelemetry", () => {
  it("reports setup, elapsed, and bounded per-tool timings", () => {
    let now = 100;
    const telemetry = new AgentRunTelemetry(() => now);

    now = 120;
    telemetry.markRunning();
    now = 150;
    telemetry.observe({
      type: "tool_execution_start",
      toolCallId: "one",
      toolName: "code_resolve",
      args: {},
    });
    now = 200;
    telemetry.observe({
      type: "tool_execution_end",
      toolCallId: "one",
      toolName: "code_resolve",
      result: {},
      isError: false,
    });
    now = 210;
    telemetry.observe({
      type: "tool_execution_start",
      toolCallId: "two",
      toolName: "code_resolve",
      args: {},
    });
    now = 240;
    telemetry.observe({
      type: "tool_execution_end",
      toolCallId: "two",
      toolName: "code_resolve",
      result: {},
      isError: true,
    });
    telemetry.observe({
      type: "tool_execution_start",
      toolCallId: "unfinished",
      toolName: "read",
      args: {},
    });
    now = 250;
    telemetry.observe({
      type: "tool_execution_start",
      toolCallId: "semantic",
      toolName: "code_find",
      args: { mode: "semantic" },
    });
    now = 260;
    telemetry.observe({
      type: "tool_execution_end",
      toolCallId: "semantic",
      toolName: "code_find",
      result: {},
      isError: false,
    });
    now = 300;

    expect(telemetry.snapshot()).toEqual({
      elapsedMs: 200,
      setupMs: 20,
      incompleteToolCount: 1,
      maxConcurrentTools: 2,
      maxToolsPerTurn: 4,
      tools: [
        {
          toolName: "code_find:semantic",
          count: 1,
          errorCount: 0,
          totalMs: 10,
          maxMs: 10,
        },
        {
          toolName: "code_resolve",
          count: 2,
          errorCount: 1,
          totalMs: 80,
          maxMs: 50,
        },
      ],
    });
  });
});
