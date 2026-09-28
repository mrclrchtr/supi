import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptSource,
} from "../../src/session/transcript-store.ts";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type { AgentsDialogDependencies } from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

function dependencies(): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn(), terminal: { rows: 40 } },
    onSteer: vi.fn(async () => "accepted" as const),
    onStop: vi.fn(async () => "accepted" as const),
  };
}

describe("Agent Run registry details", () => {
  it("shows registry failure data and totals with a complete transcript", async () => {
    const document: AgentRunTranscriptDocument = {
      metadata: {
        runKey: "review-1",
        batchId: "batch-1",
        taskId: "review-task",
        kind: "Reviewer",
        label: "change review",
        cwd: "/repo",
        modelId: "test/model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
      systemPrompt: "Reviewer prompt",
      systemPromptHistory: [],
      messages: [],
      operations: [],
      status: "complete",
      messageCount: 0,
    };
    let resolveLoad: ((loaded: AgentRunTranscriptDocument) => void) | undefined;
    const transcriptSource: AgentRunTranscriptSource = {
      runKey: "review-1",
      toolRenderers: [],
      getStatus: () => ({ status: "complete", revision: 1, messageCount: 0 }),
      load: () => new Promise((resolve) => (resolveLoad = resolve)),
    };
    const run = makeAgentsRun({
      key: "review:review-1",
      runKey: "review-1",
      taskId: "review-task",
      kind: "Reviewer",
      label: "change review",
      active: false,
      status: "failed",
      turns: 8,
      toolUses: 12,
      usage: {
        input: 100,
        output: 50,
        cacheRead: 25,
        cacheWrite: 0,
        totalTokens: 175,
        cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
      },
      result: { failureCode: "prompt-rejected" },
      transcriptSource,
    });
    const dialog = new AgentsDialog({ runs: [run] }, dependencies());
    dialog.handleInput("\t");
    dialog.handleInput("\n");
    dialog.render(100);
    resolveLoad?.(document);
    dialog.handleInput("\t");
    await vi.waitFor(() => {
      expect(dialog.render(100).join("\n")).toContain("capture complete");
    });
    const details = dialog.render(100).join("\n");
    expect(details).toContain("Registry status: failed (prompt-rejected)");
    expect(details).toContain("Runtime totals: 8 turns · 12 tool uses · 175 tokens");
    dialog.dispose();
  });

  it("shows live registry totals while transcript capture is active", async () => {
    const document: AgentRunTranscriptDocument = {
      metadata: {
        runKey: "active-1",
        batchId: "batch-active",
        taskId: "active-task",
        kind: "Agent Run",
        label: "explore",
        cwd: "/repo",
        modelId: "test/model",
        thinkingLevel: "low",
        tools: ["read"],
        startedAt: 1,
      },
      systemPrompt: "Agent prompt",
      systemPromptHistory: [],
      messages: [],
      operations: [],
      status: "capturing",
      messageCount: 0,
    };
    let resolveLoad: ((loaded: AgentRunTranscriptDocument) => void) | undefined;
    const transcriptSource: AgentRunTranscriptSource = {
      runKey: "active-1",
      toolRenderers: [],
      getStatus: () => ({ status: "capturing", revision: 1, messageCount: 0 }),
      load: () => new Promise((resolve) => (resolveLoad = resolve)),
    };
    const run = makeAgentsRun({
      key: "run:active-1",
      runKey: "active-1",
      taskId: "active-task",
      active: true,
      status: "running",
      turns: 5,
      toolUses: 9,
      usage: {
        input: 10,
        output: 5,
        cacheRead: 8,
        cacheWrite: 0,
        totalTokens: 23,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      transcriptSource,
    });
    const dialog = new AgentsDialog({ runs: [run] }, dependencies());
    dialog.handleInput("\n");
    dialog.render(100);
    resolveLoad?.(document);
    dialog.handleInput("\t");
    await vi.waitFor(() =>
      expect(dialog.render(100).join("\n")).toContain("Registry status: running"),
    );

    const details = dialog.render(100).join("\n");
    expect(details).toContain("Registry status: running");
    expect(details).toContain("Runtime totals: 5 turns · 9 tool uses · 23 tokens");
    dialog.dispose();
  });
});
