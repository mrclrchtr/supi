/** Shared text formatting for Agent Run and Agent Result renderers. */

import type { ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { BatchTaskProgress, BatchTaskResult, BatchTaskStatus } from "./batch-types.ts";

/** Human status label for one Delegation Task. */
export function statusLabel(status: BatchTaskStatus, failureCode?: string): string {
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

/** Colored status glyph for one Delegation Task. */
export function statusColor(status: BatchTaskStatus, theme: Theme): string {
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

export function formatUsage(usage: Usage | undefined): string {
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

export function firstLinePreview(text: string | undefined): string | undefined {
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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Short usage label for one-line rows: `19.6k tokens · $0.12`. */
export function formatCompactUsage(usage: Usage | undefined): string | undefined {
  if (!usage) return undefined;
  const tokens =
    usage.totalTokens >= 1_000
      ? `${(usage.totalTokens / 1_000).toFixed(1)}k tokens`
      : plural(usage.totalTokens, "token");
  const cost = usage.cost?.total;
  if (typeof cost !== "number") return tokens;
  // Sub-cent costs keep four decimals so they do not read as free.
  return `${tokens} · $${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;
}

/**
 * One-line task row shared by live progress and collapsed results:
 * `✓ id (profile) · done · model (thinking) · 2 turns · 1 tool · 19.6k tokens · $0.12`.
 */
export function compactTaskRow(
  task: Pick<
    BatchTaskProgress,
    "taskId" | "profileId" | "status" | "turns" | "toolUses" | "usage" | "modelId" | "thinkingLevel"
  > & { failureCode?: string },
  theme: Theme,
): string {
  const model = task.modelId
    ? `${task.modelId}${task.thinkingLevel ? ` (${task.thinkingLevel})` : ""}`
    : undefined;
  const metrics = [
    statusLabel(task.status, task.failureCode),
    model,
    plural(task.turns, "turn"),
    plural(task.toolUses, "tool"),
    formatCompactUsage(task.usage),
  ].filter(Boolean);
  return `${statusColor(task.status, theme)} ${theme.fg("accent", task.taskId)} ${theme.fg("dim", `(${task.profileId}) · ${metrics.join(" · ")}`)}`;
}

export function batchSummary(
  tasks: readonly BatchTaskResult[],
  usage: Usage | undefined,
  title = "Agent Run finished",
): string {
  const counts = new Map<BatchTaskStatus, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const statusParts = SUMMARY_STATUSES.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count > 0 ? [`${count} ${status}`] : [];
  });
  const parts = [title, plural(tasks.length, "task"), ...statusParts];
  const usageLabel = formatCompactUsage(usage);
  if (usageLabel) parts.push(usageLabel);
  return parts.join(" · ");
}

export function taskHeading(
  task: Pick<BatchTaskResult, "taskId" | "profileId" | "status" | "failureCode" | "conversationId">,
  theme: Theme,
): string {
  return `${statusColor(task.status, theme)} ${theme.fg("accent", task.taskId)} (${task.profileId}) — ${statusLabel(task.status, task.failureCode)} · conversation ${task.conversationId}`;
}

export function formatTaskMetrics(
  task: Pick<BatchTaskProgress, "turns" | "toolUses" | "usage" | "modelId" | "thinkingLevel">,
): string {
  const parts: string[] = [];
  const model = formatModelSegment(task.modelId, task.thinkingLevel);
  if (model) parts.push(model);
  parts.push(plural(task.turns, "turn"), plural(task.toolUses, "tool"));
  const usage = formatUsage(task.usage);
  if (usage) parts.push(usage);
  return parts.join(" · ");
}

/**
 * Human-facing label for the effective model and thinking level. Absent data
 * stays absent so the metric list never gains an empty segment. Do not add
 * color codes here: the expanded and live rows color the complete metric text.
 */
export function formatModelSegment(
  modelId: string | undefined,
  thinkingLevel: ModelThinkingLevel | undefined,
): string | undefined {
  if (!modelId) return undefined;
  return thinkingLevel ? `model: ${modelId} · thinking: ${thinkingLevel}` : `model: ${modelId}`;
}

export function errorMessage(text: string | undefined, expanded: boolean): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (!expanded) return firstLinePreview(trimmed);
  return trimmed.length <= MAX_EXPANDED_ERROR_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_EXPANDED_ERROR_CHARS - 1)}…`;
}
