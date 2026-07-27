import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { collectPlannerContext } from "../../src/history/collect.ts";

type Message = SessionContext["messages"][number];

function message(value: unknown): Message {
  return value as Message;
}

describe("collectPlannerContext", () => {
  it("includes summaries and recent visible user/assistant text only", () => {
    const context = collectPlannerContext([
      message({ role: "compactionSummary", summary: "Prior intent" }),
      message({ role: "user", content: "Please implement it" }),
      message({
        role: "assistant",
        content: [
          { type: "text", text: "Implementation complete" },
          { type: "toolCall", name: "bash", arguments: { command: "secret command" } },
        ],
      }),
      message({ role: "toolResult", toolName: "bash", content: "private tool output" }),
      message({ role: "custom", customType: "other", content: "private custom output" }),
    ]);

    expect(context).toContain("Prior intent");
    expect(context).toContain("Please implement it");
    expect(context).toContain("Implementation complete");
    expect(context).not.toContain("secret command");
    expect(context).not.toContain("private tool output");
    expect(context).not.toContain("private custom output");
  });

  it("keeps a bounded prefix when the newest visible message alone exceeds the budget", () => {
    const context = collectPlannerContext([
      message({ role: "user", content: `latest-intent-${"x".repeat(9_000)}` }),
    ]);

    expect(context).toHaveLength(8_000);
    expect(context).toContain("latest-intent-");
  });

  it("bounds conversation while retaining the most recent fitting messages", () => {
    const messages = Array.from({ length: 120 }, (_, index) =>
      message({ role: "user", content: `message-${index}-${"x".repeat(80)}` }),
    );

    const context = collectPlannerContext(messages);

    expect(context.length).toBeLessThanOrEqual(8_000);
    expect(context).toContain("message-119-");
    expect(context).not.toContain("message-0-");
  });
});
