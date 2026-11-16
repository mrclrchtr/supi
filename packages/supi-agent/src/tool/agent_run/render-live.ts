/** Live Delegation Batch progress rows shared by agent_run and agent_result. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { BatchProgressState, BatchTaskProgress } from "./batch-types.ts";
import { compactTaskRow, firstLinePreview } from "./render-format.ts";

/** One-line activity text: first line only, whitespace collapsed, bounded length. */
function activityLine(text: string, theme: Theme): string {
  return theme.fg("dim", `  ↳ ${firstLinePreview(text) ?? text.trim()}`);
}

/**
 * Live task rows: the compact task row, then activity on its own indented lines.
 * Expanded rows add the conversation ID and all recent activity.
 */
export function formatLiveTask(task: BatchTaskProgress, theme: Theme, expanded: boolean): string[] {
  const lines = [compactTaskRow(task, theme)];
  if (expanded) lines.push(theme.fg("dim", `  conversation ${task.conversationId}`));
  const activity = expanded ? (task.recentActivity ?? []) : (task.recentActivity?.slice(-1) ?? []);
  for (const entry of activity) if (entry.trim()) lines.push(activityLine(entry, theme));
  return lines;
}

/** Render live per-task batch progress; `title` names the waiting surface. */
export function renderPartial(
  details: BatchProgressState | undefined,
  expanded: boolean,
  theme: Theme,
  title = "Agent Run",
): Text {
  const completed = details?.completedCount ?? 0;
  const total = details?.totalCount ?? 0;
  const label = total > 0 ? `${title} · ${completed}/${total} done` : title;
  const tasks = details?.tasks ?? [];
  const lines = [
    theme.fg("accent", `● ${label}`),
    ...tasks.flatMap((task) => formatLiveTask(task, theme, expanded)),
  ];
  return new Text(lines.join("\n"), 0, 0);
}
