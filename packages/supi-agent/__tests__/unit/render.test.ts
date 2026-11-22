import { describe, expect, it } from "vitest";
import {
  renderResult as renderAgentResult,
  renderCompletionNotice,
} from "../../src/tool/agent_result/render.ts";
import { renderCall, renderResult } from "../../src/tool/agent_run/render.ts";

const mockTheme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => `*${text}*`,
};

describe("renderCall", () => {
  it("renders a compact task summary", () => {
    const result = renderCall(
      { tasks: [{ id: "t1", new: { profile: "explore" } }] },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });
});

describe("renderResult", () => {
  it("renders a background receipt as started, not finished", () => {
    const result = renderResult(
      { details: { mode: "background", batchId: "batch-123", tasks: [], totalCount: 1 } },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(120).join("\n");
    expect(text).toContain("background");
    expect(text).toContain("batch-123");
    expect(text).not.toContain("finished");
  });
  it("renders partial progress", () => {
    const result = renderResult(
      { details: { tasks: [], completedCount: 1, totalCount: 2 } },
      { expanded: false, isPartial: true },
      mockTheme as never,
    );
    expect(result).toBeDefined();
  });

  it("renders the effective model, thinking level, and conversation for an expanded live task", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              conversationId: "c1",
              status: "running",
              turns: 2,
              toolUses: 2,
              modelId: "anthropic/claude-sonnet-4-5",
              thinkingLevel: "high",
            },
          ],
          completedCount: 0,
          totalCount: 1,
        },
      },
      { expanded: true, isPartial: true },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("anthropic/claude-sonnet-4-5 (high) · 2 turns · 2 tools");
    expect(text).toContain("conversation c1");
  });

  it("renders collapsed final with task status, progress, and an output preview", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "Found the caller.\nMore detail follows.",
              humanTruncated: false,
              modelTruncated: false,
              usage: { totalTokens: 1000 },
              modelId: "anthropic/claude-sonnet-4-5",
              thinkingLevel: "high",
            },
          ],
          aggregateUsage: { totalTokens: 1000 },
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("Agent Run finished");
    expect(text).toContain("1 completed");
    expect(text).toContain("1.0k tokens");
    expect(text).toContain("Found the caller.");
    expect(text).toContain("done · anthropic/claude-sonnet-4-5 (high) · 5 turns · 3 tools");
    // Collapsed rows keep the conversation ID for the expanded view only.
    expect(text).not.toContain("conversation");
  });

  it("renders the model alone when the thinking level is unavailable", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "Found the caller.",
              humanTruncated: false,
              modelTruncated: false,
              modelId: "anthropic/claude-sonnet-4-5",
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("anthropic/claude-sonnet-4-5 · 5 turns · 3 tools");
    expect(text).not.toContain("(high)");
  });

  it("omits the thinking segment when the model is unavailable", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "Found the caller.",
              humanTruncated: false,
              modelTruncated: false,
              thinkingLevel: "high",
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).not.toContain("model:");
    expect(text).not.toContain("thinking:");
    expect(text).not.toContain("· ·");
    expect(text).toContain("5 turns · 3 tools");
  });

  it("omits the model and thinking segments when they are unavailable", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "Found the caller.",
              humanTruncated: false,
              modelTruncated: false,
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).not.toContain("model:");
    expect(text).not.toContain("thinking:");
    expect(text).not.toContain("· ·");
    expect(text).toContain("5 turns · 3 tools");
  });

  it("renders expanded final with task details and the result body", () => {
    const result = renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "t1",
              profileId: "explore",
              status: "completed",
              turns: 5,
              toolUses: 3,
              finalTextFull: "## Findings\n\nThe caller is in `src/index.ts`.",
              humanTruncated: false,
              modelTruncated: false,
              usage: { totalTokens: 1000 },
              modelId: "anthropic/claude-sonnet-4-5",
              thinkingLevel: "off",
            },
          ],
          aggregateUsage: { totalTokens: 1000 },
        },
      },
      { expanded: true, isPartial: false },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("Agent Run finished");
    expect(text).toContain("Findings");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("1,000 tokens");
    expect(text).toContain(
      "model: anthropic/claude-sonnet-4-5 · thinking: off · 5 turns · 3 tools",
    );
  });

  it("renders error state from Pi's renderer context", () => {
    const result = renderResult(
      { content: [{ type: "text", text: "Provider rejected the request\nDetails omitted" }] },
      { expanded: false, isPartial: false },
      mockTheme as never,
      { isError: true },
    );
    const text = result.render(240).join("\n");
    const expanded = renderResult(
      { content: [{ type: "text", text: "Provider rejected the request\nDetails omitted" }] },
      { expanded: true, isPartial: false },
      mockTheme as never,
      { isError: true },
    );
    const expandedText = expanded.render(240).join("\n");

    expect(text).toContain("Agent Run failed: Provider rejected the request");
    expect(expandedText).toContain("Details omitted");
  });
});

describe("agent_result wait rendering", () => {
  it("shows live per-task progress while waiting", () => {
    const result = renderAgentResult(
      {
        details: {
          batchId: "batch-1",
          tasks: [
            {
              taskId: "audit",
              profileId: "explore",
              conversationId: "c1",
              status: "running",
              turns: 3,
              toolUses: 5,
              recentActivity: ["read src/a.ts"],
            },
          ],
          completedCount: 0,
          totalCount: 1,
        },
      },
      { expanded: false, isPartial: true },
      mockTheme as never,
    );
    const text = result.render(240).join("\n");

    expect(text).toContain("Waiting for agents · 0/1 done");
    expect(text).toContain("[accent]audit[/accent] [dim](explore) · running · 3 turns · 5 tools");
    expect(text).toContain("↳ read src/a.ts");
    // Collapsed rows omit conversation IDs; they appear only when expanded.
    expect(text).not.toContain("conversation c1");
  });
});

describe("renderCompletionNotice", () => {
  const message = {
    content:
      'Background batch batch-uuid: "edge-mail" completed. Collect available results and Usage with agent_result.',
    details: {
      batchId: "batch-uuid",
      taskIds: ["edge-mail", "research"],
      tasks: [
        {
          taskId: "edge-mail",
          profileId: "explore",
          status: "completed",
          finalText: "Final report from edge-mail",
        },
        { taskId: "research", profileId: "general", status: "failed", failureCode: "timeout" },
      ],
    },
  };

  it("shows one status line per task without model-facing instructions when collapsed", () => {
    const text = renderCompletionNotice(message, { expanded: false }, mockTheme as never)
      .render(120)
      .join("\n");
    expect(text).toContain("[success]✓[/success] [accent]edge-mail[/accent]");
    expect(text).toContain("[error]✗[/error] [accent]research[/accent]");
    expect(text).toContain("failed (timeout)");
    expect(text).not.toContain("batch-uuid");
    expect(text).not.toContain("Collect available results");
    expect(text).not.toContain("Final report");
  });

  it("shows the final task text and batch ID only when expanded", () => {
    const text = renderCompletionNotice(message, { expanded: true }, mockTheme as never)
      .render(120)
      .join("\n");
    expect(text).toContain("batch-uuid");
    expect(text).toContain("Final report from edge-mail");
  });

  it("falls back to the stored text for notices without task summaries", () => {
    const text = renderCompletionNotice(
      { content: message.content, details: { batchId: "batch-uuid", taskIds: ["edge-mail"] } },
      { expanded: false },
      mockTheme as never,
    )
      .render(200)
      .join("\n");
    expect(text).toContain("edge-mail");
  });
});

describe("agent_result collected rendering", () => {
  const finished = {
    taskId: "audit",
    profileId: "explore",
    conversationId: "c1",
    status: "completed",
    turns: 3,
    toolUses: 5,
    finalTextFull: "Found two callers.\nDetails follow.",
    humanTruncated: false,
    modelTruncated: false,
  };

  it("shows per-task output previews and still-pending tasks when collapsed", () => {
    const text = renderAgentResult(
      {
        details: {
          tasks: [finished],
          pending: [{ taskId: "slow", profileId: "general", status: "running" }],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as never,
    )
      .render(240)
      .join("\n");

    expect(text).toContain("Agent results · 1 task · 1 completed");
    expect(text).toContain("↳ Found two callers.");
    expect(text).not.toContain("Details follow.");
    expect(text).toContain("[accent]slow[/accent] [dim](general) · running");
  });

  it("shows the full output when expanded", () => {
    const text = renderAgentResult(
      { details: { tasks: [finished], pending: [] } },
      { expanded: true, isPartial: false },
      mockTheme as never,
    )
      .render(240)
      .join("\n");

    expect(text).toContain("Details follow.");
  });
});
