/**
 * TUI renderer for agent_run — renderCall + renderResult.
 *
 * Dual-surface: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { BatchProgressState, BatchTaskResult } from "./batch-types.ts";
import type { AgentConversationView, ConversationEntry } from "./conversation-view.ts";
import {
  batchSummary,
  compactTaskRow,
  errorMessage,
  firstLinePreview,
  formatTaskMetrics,
  taskHeading,
} from "./render-format.ts";
import { formatLiveTask, renderPartial } from "./render-live.ts";
import type { AgentRunResultDetails } from "./result.ts";

// ── renderCall ───────────────────────────────────────────────────

export function renderCall(args: unknown, theme: Theme): Text {
  const a = (args ?? {}) as {
    tasks?: Array<{
      id?: string;
      new?: { profile?: string };
      continue?: { conversationId?: string };
    }>;
    sharedContext?: string;
  };
  const taskIds =
    a.tasks
      ?.map((task) => {
        const id = task?.id ?? "…";
        if (task?.new) return `${id}:new(${task.new.profile ?? "…"})`;
        if (task?.continue) return `${id}:continue(${task.continue.conversationId ?? "…"})`;
        return id;
      })
      .join(", ") ?? "";
  const label = a.tasks?.length ? `${a.tasks.length} task${a.tasks.length > 1 ? "s" : ""}` : "";
  let content = theme.fg("toolTitle", "Agent Run");
  if (label) content += ` ${theme.fg("accent", label)}`;
  if (taskIds) content += theme.fg("dim", ` — ${taskIds}`);
  if (a.sharedContext) {
    const preview =
      a.sharedContext.length > 60 ? `${a.sharedContext.slice(0, 57)}…` : a.sharedContext;
    content += theme.fg("dim", ` · ${preview}`);
  }
  return new Text(content, 0, 0);
}

// ── renderResult ─────────────────────────────────────────────────

/** Render bounded Agent Run progress and results for the PI tool row. */
export function renderResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    isError?: boolean;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError?: boolean } = {},
): Container | Text {
  if (options.isPartial) {
    return renderPartial(result.details as BatchProgressState | undefined, options.expanded, theme);
  }
  if (result.isError || context.isError) {
    const message = errorMessage(
      result.content?.find((content) => content.type === "text")?.text,
      options.expanded,
    );
    return new Text(
      theme.fg("error", message ? `Agent Run failed: ${message}` : "Agent Run failed"),
      0,
      0,
    );
  }
  const background = result.details as
    | (BatchProgressState & { mode?: string; batchId?: string })
    | undefined;
  if (background?.mode === "background") {
    return new Text(
      [
        theme.fg("accent", `Agent Run started in background · ${background.batchId ?? ""}`),
        ...background.tasks.flatMap((task) => formatLiveTask(task, theme, options.expanded)),
      ].join("\n"),
      0,
      0,
    );
  }
  return renderFinal(result.details as BatchDetails | undefined, options.expanded, theme);
}
// ── Final result ─────────────────────────────────────────────────

type BatchDetails = Pick<
  AgentRunResultDetails,
  "tasks" | "sharedContext" | "aggregateUsage" | "conversationViews" | "fullOutputPath"
>;

/**
 * Render finished task results: collapsed shows status and a one-line output preview per task,
 * expanded shows full output and conversation views. `title` replaces the summary label.
 */
export function renderFinal(
  details: BatchDetails | undefined,
  expanded: boolean,
  theme: Theme,
  title?: string,
): Container | Text {
  if (!details?.tasks?.length) {
    return new Text(theme.fg("dim", "No results."), 0, 0);
  }

  if (!expanded) {
    return renderCollapsed(details, theme, title);
  }
  return renderExpanded(details, theme, title);
}

function renderCollapsed(details: BatchDetails, theme: Theme, title?: string): Text {
  const tasks = details.tasks ?? [];
  const lines = [
    theme.fg("accent", theme.bold(batchSummary(tasks, details.aggregateUsage, title))),
  ];
  for (const task of tasks) {
    const truncation = task.humanTruncated || task.modelTruncated ? " · [truncated]" : "";
    lines.push(`${compactTaskRow(task, theme)}${theme.fg("dim", truncation)}`);
    const preview = task.status === "completed" ? firstLinePreview(task.finalTextFull) : undefined;
    if (preview) lines.push(theme.fg("dim", `  ↳ ${preview}`));
  }
  return new Text(lines.join("\n"), 0, 0);
}

/** Format one safe Conversation View entry for human-facing renderers. */
export function renderConversationEntry(entry: ConversationEntry, theme: Theme): string {
  switch (entry.kind) {
    case "assistant":
      return `${theme.fg("muted", "assistant: ")}${entry.text}`;
    case "steering":
      return `${theme.fg("accent", "steering: ")}${entry.text}`;
    case "tool":
      return `${theme.fg("muted", `tool ${entry.toolName} (${entry.status})`)}${
        entry.summary ? ` — ${entry.summary}` : ""
      }`;
  }
}

function renderConversationView(
  container: Container,
  view: AgentConversationView,
  theme: Theme,
): void {
  container.addChild(new Text(theme.fg("muted", "Task metadata"), 1, 0));
  container.addChild(
    new Text(theme.fg("dim", `instructions: ${view.taskMetadata.instructions}`), 1, 0),
  );
  if (view.omittedEntryCount > 0) {
    const suffix = view.textTruncated ? " (text bound)" : "";
    const entryLabel = `${view.omittedEntryCount} conversation ${view.omittedEntryCount === 1 ? "entry" : "entries"}`;
    const characterLabel = `${view.omittedCharacterCount.toLocaleString("en-US")} ${view.omittedCharacterCount === 1 ? "character" : "characters"}`;
    container.addChild(
      new Text(theme.fg("warning", `${entryLabel} and ${characterLabel} omitted${suffix}`), 1, 0),
    );
  }
  for (const entry of view.entries) {
    container.addChild(new Text(renderConversationEntry(entry, theme), 1, 0));
  }
}

function renderExpanded(details: BatchDetails, theme: Theme, title?: string): Container {
  const container = new Container();
  const tasks = details.tasks ?? [];
  container.addChild(
    new Text(
      theme.fg("accent", theme.bold(batchSummary(tasks, details.aggregateUsage, title))),
      1,
      0,
    ),
  );

  if (details.fullOutputPath) {
    container.addChild(
      new Text(theme.fg("warning", `Full output saved to: ${details.fullOutputPath}`), 1, 0),
    );
  }
  if (details.sharedContext) {
    container.addChild(new Text(theme.fg("dim", `context: ${details.sharedContext}`), 1, 0));
  }

  for (const task of tasks) {
    container.addChild(new Spacer(1));
    renderExpandedTask(container, task, details.conversationViews?.[task.taskId], theme);
  }

  return container;
}

function renderExpandedTask(
  container: Container,
  task: BatchTaskResult,
  view: AgentConversationView | undefined,
  theme: Theme,
): void {
  const truncation = [
    task.humanTruncated ? "[truncated]" : undefined,
    task.modelTruncated ? "model output truncated" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const suffix = truncation ? ` · ${truncation}` : "";
  container.addChild(new Text(taskHeading(task, theme), 1, 0));
  container.addChild(new Text(theme.fg("dim", `${formatTaskMetrics(task)}${suffix}`), 1, 0));

  if (task.status === "completed") {
    container.addChild(new Text(theme.fg("muted", "Output"), 1, 0));
    const output = task.finalTextFull?.trim().length ? task.finalTextFull : "No output retained.";
    container.addChild(new Text(theme.fg("muted", output), 1, 0));
  }
  if (task.failureCode) {
    container.addChild(new Text(theme.fg("dim", `failure: ${task.failureCode}`), 1, 0));
  }
  if (task.failureSummary)
    container.addChild(new Text(theme.fg("warning", task.failureSummary), 1, 0));
  if (view) renderConversationView(container, view, theme);
}
