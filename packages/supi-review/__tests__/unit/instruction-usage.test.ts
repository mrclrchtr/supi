import { describe, expect, it } from "vitest";
import { InstructionFileUsageObserver } from "../../src/tool/review_run/instruction-usage.ts";

const cwd = "/workspace";

interface Call {
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
}

function run(observer: InstructionFileUsageObserver, calls: Call[]): void {
  calls.forEach(({ toolName, args, result = {}, isError = false }, index) => {
    const toolCallId = String(index);
    observer.observe({ type: "tool_execution_start", toolCallId, toolName, args });
    observer.observe({ type: "tool_execution_end", toolCallId, toolName, result, isError });
  });
}

describe("instruction file usage", () => {
  it("counts each indexed file once per route and only complete, successful reads", () => {
    const indexed = ["pkg/CLAUDE.md", "lib/AGENTS.md", "app/CLAUDE.md"];
    const observer = new InstructionFileUsageObserver(indexed, cwd);

    run(observer, [
      { toolName: "read", args: { path: "/workspace/pkg/CLAUDE.md" } },
      { toolName: "read", args: { path: "pkg/CLAUDE.md" } },
      { toolName: "read", args: { path: "lib/AGENTS.md", offset: 1, limit: 20 } },
      {
        toolName: "read",
        args: { path: "app/CLAUDE.md" },
        result: { details: { truncation: { truncated: true } } },
      },
      { toolName: "read", args: { path: "app/CLAUDE.md" }, isError: true },
      { toolName: "bash", args: { command: "cat lib/AGENTS.md | head" } },
      {
        toolName: "code_orientation",
        args: { focus: { path: "app" } },
        result: {
          details: {
            type: "context",
            data: { instructions: { files: [{ path: "app/CLAUDE.md" }] } },
          },
        },
      },
      { toolName: "read", args: { path: "CLAUDE.md" } },
    ]);

    expect(observer.snapshot()).toEqual({
      indexed: 3,
      deliveredByOrientation: 1,
      readInFull: 1,
      mentionedInBash: 1,
      reached: 3,
    });
  });
});
