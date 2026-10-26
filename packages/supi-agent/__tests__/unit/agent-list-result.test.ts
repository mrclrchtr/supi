import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { renderResult } from "../../src/tool/agent_list/render.ts";
import { type AgentListRow, buildAgentListResult } from "../../src/tool/agent_list/result.ts";

const rows: readonly AgentListRow[] = [
  { conversationId: "conversation-a", label: "First", profileId: "explore", status: "available" },
  { conversationId: "conversation-b", label: "Second", profileId: "explore", status: "busy" },
];

describe("Agent Conversation list pages", () => {
  it.each([2, 20])(
    "identifies an exhausted page at offset %i without inventing a range",
    (offset) => {
      const result = buildAgentListResult({ rows, offset, limit: 2 });
      const message = `No Agent Conversations at offset ${offset}; 2 total.`;
      expect(result.content).toEqual([{ type: "text", text: message }]);
      expect(result.details).toEqual({ offset, limit: 2, total: 2, rows: [] });
      const rendered = renderResult(
        result,
        { expanded: true, isPartial: false },
        makeCtx().ui.theme as unknown as Theme,
      )
        .render(160)
        .join("\n");
      expect(rendered).toContain(message);
      expect(rendered).not.toContain("No saved Agent Conversations on this branch.");
    },
  );

  it("keeps populated page ranges and selected rows unchanged", () => {
    const result = buildAgentListResult({ rows, offset: 1, limit: 1 });
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Agent Conversations 2-2 of 2:\nconversation-b · Second · explore · busy",
      },
    ]);
    expect(result.details).toEqual({ offset: 1, limit: 1, total: 2, rows: [rows[1]] });
    const rendered = renderResult(
      result,
      { expanded: true, isPartial: false },
      makeCtx().ui.theme as unknown as Theme,
    )
      .render(160)
      .join("\n");
    expect(rendered).toContain("conversation-b · Second · explore · busy");
    expect(rendered).not.toContain("conversation-a");
  });

  it("reports a genuinely empty branch without a fabricated zero range", () => {
    const result = buildAgentListResult({ rows: [], offset: 0, limit: 2 });
    const message = "No saved Agent Conversations on this branch.";
    expect(result.content).toEqual([{ type: "text", text: message }]);
    expect(result.details).toEqual({ offset: 0, limit: 2, total: 0, rows: [] });
    const rendered = renderResult(
      result,
      { expanded: true, isPartial: false },
      makeCtx().ui.theme as unknown as Theme,
    )
      .render(160)
      .join("\n");
    expect(rendered).toContain(message);
    expect(rendered).not.toContain("at offset");
  });
});
