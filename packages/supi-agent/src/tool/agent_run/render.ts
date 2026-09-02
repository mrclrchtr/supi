/**
 * TUI renderer for agent_run — renderCall + renderResult.
 *
 * Dual-surface: chrome built from details, markdown body excluded.
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentConversationView, ConversationEntry } from "./conversation-view.ts";
import type {
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
  BatchTaskStatus,
} from "./registry.ts";
import type { AgentRunResultDetails } from "./result.ts";

// ── Helpers ──────────────────────────────────────────────────────

function statusLabel(status: BatchTaskStatus, failureCode?: string): string {
  switch (status) {
    case "starting":
      return "starting";
    case "running":
      return "running";
    case "stopping":
      return "stopping";
    case "completed":
      return "done";
    case "failed":
      return failureCode ? `failed (${failureCode})` : "failed";
    case "canceled":
      return "canceled";
    case "timeout":
      return "timeout";
  }
}

function statusColor(status: BatchTaskStatus, theme: Theme): string {
  switch (status) {
    case "starting":
      return theme.fg("accent", "○");
    case "running":
      return theme.fg("accent", "●");
    case "stopping":
      return theme.fg("warning", "◐");
    case "completed":
      return theme.fg("success", "✓");
    case "failed":
      return theme.fg("error", "✗");
    case "canceled":
      return theme.fg("warning", "×");
    case "timeout":
      return theme.fg("warning", "⌛");
  }
}

const MAX_COLLAPSED_OUTPUT_PREVIEW_CHARS = 140;
const MAX_EXPANDED_ERROR_CHARS = 2_000;
const SUMMARY_STATUSES = ["completed", "failed", "canceled", "timeout"] as const;

function formatUsage(usage: Usage | undefined): string {
  if (!usage) return "";
  const parts = [`${usage.totalTokens.toLocaleString("en-US")} tokens`];
  if (typeof usage.input === "number" && typeof usage.output === "number") {
    parts.push(
      `${usage.input.toLocaleString("en-US")} in`,
      `${usage.output.toLocaleString("en-US")} out`,
    );
  }
  if (typeof usage.cost?.total === "number") parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" · ");
}

function firstLinePreview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean);
  if (!line) return undefined;
  const collapsed = line.replace(/\s+/g, " ");
  return collapsed.length <= MAX_COLLAPSED_OUTPUT_PREVIEW_CHARS
    ? collapsed
    : `${collapsed.slice(0, MAX_COLLAPSED_OUTPUT_PREVIEW_CHARS - 1)}…`;
}

function batchSummary(tasks: readonly BatchTaskResult[], usage: Usage | undefined): string {
  const counts = new Map<BatchTaskStatus, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const statusParts = SUMMARY_STATUSES.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count > 0 ? [`${count} ${status}`] : [];
  });
  const parts = [
    "Agent Run finished",
    `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
    ...statusParts,
  ];
  const usageLabel = formatUsage(usage);
  if (usageLabel) parts.push(usageLabel);
  return parts.join(" · ");
}

function taskHeading(
  task: Pick<BatchTaskResult, "taskId" | "profileId" | "status" | "failureCode">,
  theme: Theme,
): string {
  return `${statusColor(task.status, theme)} ${theme.fg("accent", task.taskId)} (${task.profileId}) — ${statusLabel(task.status, task.failureCode)}`;
}

function formatTaskMetrics(task: Pick<BatchTaskProgress, "turns" | "toolUses" | "usage">): string {
  const parts = [`${task.turns} turns`, `${task.toolUses} tools`];
  const usage = formatUsage(task.usage);
  if (usage) parts.push(usage);
  return parts.join(" · ");
}

function errorMessage(text: string | undefined, expanded: boolean): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (!expanded) return firstLinePreview(trimmed);
  return trimmed.length <= MAX_EXPANDED_ERROR_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_EXPANDED_ERROR_CHARS - 1)}…`;
}

// ── renderCall ───────────────────────────────────────────────────

export function renderCall(args: unknown, theme: Theme): Text {
  const a = (args ?? {}) as {
    tasks?: Array<{ id: string; profile: string }>;
    sharedContext?: string;
  };
  const taskIds = a.tasks?.map((task) => `${task.id}:${task.profile}`).join(", ") ?? "";
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
  return renderFinal(result.details as BatchDetails | undefined, options.expanded, theme);
}

// ── Partial ──────────────────────────────────────────────────────

function formatLiveTask(task: BatchTaskProgress, theme: Theme, expanded: boolean): string {
  const parts = [statusLabel(task.status), formatTaskMetrics(task)];
  const activity = expanded ? task.recentActivity?.join(" · ") : task.recentActivity?.at(-1);
  if (activity) parts.push(`activity: ${activity}`);
  return `${statusColor(task.status, theme)} ${task.taskId} (${task.profileId}) · ${parts.join(" · ")}`;
}

function renderPartial(
  details: BatchProgressState | undefined,
  expanded: boolean,
  theme: Theme,
): Container | Text {
  const completed = details?.completedCount ?? 0;
  const total = details?.totalCount ?? 0;
  const label = total > 0 ? `Agent Run · ${completed} of ${total} tasks finished` : "Agent Run";
  const tasks = details?.tasks ?? [];
  const header = theme.fg("warning", `● ${label}`);

  if (!expanded) {
    const lines = [
      header,
      ...tasks.map((task) => theme.fg("dim", formatLiveTask(task, theme, false))),
    ];
    return new Text(lines.join("\n"), 0, 0);
  }

  const container = new Container();
  container.addChild(new Text(header, 0, 0));
  for (const task of tasks) {
    container.addChild(new Text(theme.fg("dim", formatLiveTask(task, theme, true)), 1, 0));
  }
  return container;
}

// ── Final result ─────────────────────────────────────────────────

type BatchDetails = Pick<
  AgentRunResultDetails,
  "tasks" | "sharedContext" | "aggregateUsage" | "conversationViews" | "fullOutputPath"
>;

function renderFinal(
  details: BatchDetails | undefined,
  expanded: boolean,
  theme: Theme,
): Container | Text {
  if (!details?.tasks?.length) {
    return new Text(theme.fg("dim", "No results."), 0, 0);
  }

  if (!expanded) {
    return renderCollapsed(details, theme);
  }
  return renderExpanded(details, theme);
}

function renderCollapsed(details: BatchDetails, theme: Theme): Text {
  const tasks = details.tasks ?? [];
  const lines = [theme.fg("accent", theme.bold(batchSummary(tasks, details.aggregateUsage)))];
  for (const task of tasks) {
    const truncation = task.humanTruncated || task.modelTruncated ? " · [truncated]" : "";
    lines.push(`${taskHeading(task, theme)} · ${formatTaskMetrics(task)}${truncation}`);
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

function renderExpanded(details: BatchDetails, theme: Theme): Container {
  const container = new Container();
  const tasks = details.tasks ?? [];
  container.addChild(
    new Text(theme.fg("accent", theme.bold(batchSummary(tasks, details.aggregateUsage))), 1, 0),
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
  if (view) renderConversationView(container, view, theme);
}
