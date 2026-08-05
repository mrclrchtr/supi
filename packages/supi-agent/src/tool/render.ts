/**
 * TUI renderer for supi_agent_run — renderCall + renderResult.
 *
 * Dual-surface: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { BatchTaskResult, BatchTaskStatus } from "./registry.ts";

// ── Helpers ──────────────────────────────────────────────────────

function statusLabel(status: BatchTaskStatus, failureCode?: string): string {
  switch (status) {
    case "running":
      return "running";
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
    case "running":
      return theme.fg("accent", "●");
    case "completed":
      return theme.fg("success", "✓");
    case "failed":
    case "canceled":
    case "timeout":
      return theme.fg("warning", "!");
  }
}

interface LiveTaskState {
  taskId: string;
  profileId: string;
  status: BatchTaskStatus;
  turns: number;
  toolUses: number;
  usage?: { totalTokens?: number };
}

interface LiveDetails {
  tasks?: LiveTaskState[];
  completedCount?: number;
  totalCount?: number;
  sharedContext?: string;
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
    return renderPartial(result.details as LiveDetails | undefined, options.expanded, theme);
  }
  if (result.isError) {
    return new Text(theme.fg("error", "Agent Run failed"), 0, 0);
  }
  return renderFinal(result.details as BatchDetails | undefined, options.expanded, theme);
}

// ── Partial ──────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering collects status/count fields per task.
function renderPartial(
  details: LiveDetails | undefined,
  expanded: boolean,
  theme: Theme,
): Container | Text {
  const completed = details?.completedCount ?? 0;
  const total = details?.totalCount ?? 0;
  const label = total > 0 ? `Delegating… (${completed} of ${total} tasks finished)` : "Delegating…";

  if (!expanded) {
    return new Text(theme.fg("warning", `● ${label}`), 0, 0);
  }

  const container = new Container();
  container.addChild(new Text(theme.fg("warning", `● ${label}`), 0, 0));

  if (!details?.tasks?.length) return container;

  for (const task of details.tasks) {
    const icon = task.status === "running" ? "●" : task.status === "completed" ? "✓" : "!";
    const color =
      task.status === "running"
        ? theme.fg("accent", icon)
        : task.status === "completed"
          ? theme.fg("success", icon)
          : theme.fg("warning", icon);
    const parts = [`${task.turns} turns`, `${task.toolUses} tools`];
    if (task.usage?.totalTokens != null) {
      parts.push(`${task.usage.totalTokens.toLocaleString("en-US")} tokens`);
    }
    const line = `${color} ${task.taskId} (${task.profileId}) · ${parts.join(" · ")}`;
    container.addChild(new Text(theme.fg("dim", line), 1, 0));
  }

  return container;
}

// ── Final result ─────────────────────────────────────────────────

interface BatchDetails {
  tasks?: BatchTaskResult[];
  sharedContext?: string;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: expanded final rendering show status/text/usage/truncation per task.
function renderExpanded(details: BatchDetails, theme: Theme): Container {
  const container = new Container();
  container.addChild(new Text(`${theme.fg("accent", theme.bold("Agent Run Finished"))}`, 1, 0));

  if (details.sharedContext) {
    const preview =
      details.sharedContext.length > 100
        ? `${details.sharedContext.slice(0, 97)}…`
        : details.sharedContext;
    container.addChild(new Text(theme.fg("dim", `context: ${preview}`), 1, 0));
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
      // Show bounded final text.
      const preview =
        task.finalTextFull.length > 300
          ? `${task.finalTextFull.slice(0, 297)}…`
          : task.finalTextFull;
      container.addChild(new Text(theme.fg("dim", preview), 1, 0));
    }
    if (task.failureCode) {
      container.addChild(new Text(theme.fg("dim", `  ${task.failureCode}`), 1, 0));
    }
  }

  return container;
}
