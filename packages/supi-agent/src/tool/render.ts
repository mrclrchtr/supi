/**
 * TUI renderer for supi_agent_run — renderCall + renderResult.
 *
 * Dual-surface: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { AgentConversationView, ConversationEntry } from "./conversation-view.ts";
import type {
  BatchProgressState,
  BatchTaskProgress,
  BatchTaskResult,
  BatchTaskStatus,
} from "./registry.ts";

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

export function renderResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    isError?: boolean;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Container | Text {
  if (options.isPartial) {
    return renderPartial(result.details as BatchProgressState | undefined, options.expanded, theme);
  }
  if (result.isError) {
    return new Text(theme.fg("error", "Agent Run failed"), 0, 0);
  }
  return renderFinal(result.details as BatchDetails | undefined, options.expanded, theme);
}

// ── Partial ──────────────────────────────────────────────────────

function formatLiveTask(task: BatchTaskProgress, theme: Theme, expanded: boolean): string {
  const parts = [statusLabel(task.status), `${task.turns} turns`, `${task.toolUses} tools`];
  if (task.usage?.totalTokens != null) {
    parts.push(`${task.usage.totalTokens.toLocaleString("en-US")} tokens`);
  }
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
  const label = total > 0 ? `Delegating… (${completed} of ${total} tasks finished)` : "Delegating…";
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

interface BatchDetails {
  tasks?: BatchTaskResult[];
  sharedContext?: string;
  conversationViews?: Readonly<Record<string, AgentConversationView>>;
}

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
  const parts = tasks.map((task) => {
    const icon = statusColor(task.status, theme);
    const label = statusLabel(task.status, task.failureCode);
    return `${icon} ${task.taskId}:${task.profileId} — ${label}`;
  });
  return new Text(parts.join(` ${theme.fg("dim", "·")} `), 0, 0);
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
  container.addChild(new Text(`${theme.fg("accent", theme.bold("Agent Run Finished"))}`, 1, 0));

  if (details.sharedContext) {
    container.addChild(new Text(theme.fg("dim", `context: ${details.sharedContext}`), 1, 0));
  }

  for (const task of details.tasks ?? []) {
    const status = statusLabel(task.status, task.failureCode);
    const icon = statusColor(task.status, theme);
    const usageStr = task.usage
      ? ` · ${task.usage.totalTokens.toLocaleString("en-US")} tokens`
      : "";
    const truncationStr = task.humanTruncated ? " · [truncated]" : "";
    container.addChild(
      new Text(
        `${icon} ${theme.fg("accent", task.taskId)} (${task.profileId}) — ${status}${usageStr}${truncationStr}`,
        1,
        0,
      ),
    );

    if (task.finalTextFull && task.status === "completed") {
      container.addChild(new Text(theme.fg("muted", "Output"), 1, 0));
      container.addChild(new Text(theme.fg("dim", task.finalTextFull), 1, 0));
    }
    if (task.failureCode) {
      container.addChild(new Text(theme.fg("dim", `  ${task.failureCode}`), 1, 0));
    }

    const view = details.conversationViews?.[task.taskId];
    if (view) renderConversationView(container, view, theme);
  }

  return container;
}
