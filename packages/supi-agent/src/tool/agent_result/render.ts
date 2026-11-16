import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { BatchProgressState, BatchTaskProgress } from "../agent_run/batch-types.ts";
import { renderFinal } from "../agent_run/render.ts";
import { statusColor, statusLabel } from "../agent_run/render-format.ts";
import { renderPartial } from "../agent_run/render-live.ts";
import type { AgentRunResultDetails } from "../agent_run/result.ts";
import { renderBatchCall, renderBatchError } from "../background-render.ts";
import type { CompletionNoticeDetails } from "./result.ts";

/**
 * Render a background completion notice for humans: one status line per task.
 * Expanded, it adds each task's final assistant text and the batch ID.
 */
export function renderCompletionNotice(
  message: { content: unknown; details?: unknown },
  options: { expanded: boolean },
  theme: Theme,
): Text {
  const details = message.details as Partial<CompletionNoticeDetails> | undefined;
  const tasks = details?.tasks;
  // Notices persisted before `tasks` existed fall back to the model-facing text.
  if (!tasks?.length) {
    const text = typeof message.content === "string" ? message.content : "Agent batch finished.";
    return new Text(theme.fg("dim", text), 0, 0);
  }
  const lines = [theme.fg("toolTitle", "Agent finished")];
  for (const task of tasks) {
    lines.push(
      `${statusColor(task.status, theme)} ${theme.fg("accent", task.taskId)} ${theme.fg("dim", `(${task.profileId})`)} · ${statusLabel(task.status, task.failureCode)}`,
    );
    if (!options.expanded) continue;
    if (task.failureSummary) lines.push(theme.fg("warning", task.failureSummary));
    if (task.finalText) lines.push(task.finalText, "");
  }
  if (options.expanded && details?.batchId)
    lines.push(theme.fg("dim", `Batch ${details.batchId} · results collected with agent_result`));
  return new Text(lines.join("\n"), 0, 0);
}

/** Render the collection handle without task instructions. */
export function renderCall(args: unknown, theme: Theme): Text {
  return renderBatchCall("Agent Result", args, theme);
}

/**
 * Waiting shows live task rows. Collected results reuse the Agent Run final layout (status and
 * output preview collapsed, full output expanded); still-pending tasks follow as status rows.
 */
export function renderResult(
  result: { details?: unknown; content?: { type: string; text?: string }[] },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError?: boolean } = {},
): Container | Text {
  if (context.isError) return renderBatchError(result, theme);
  if (options.isPartial) {
    const progress = result.details as Partial<BatchProgressState> | undefined;
    if (!progress?.tasks) return new Text(theme.fg("dim", "Waiting for agents…"), 0, 0);
    return renderPartial(
      progress as BatchProgressState,
      options.expanded,
      theme,
      "Waiting for agents",
    );
  }
  const details = result.details as
    | (AgentRunResultDetails & {
        alreadyCollected?: boolean;
        pending?: Pick<BatchTaskProgress, "taskId" | "profileId" | "status">[];
      })
    | undefined;
  const pending = details?.pending ?? [];
  const footer: string[] = pending.map(
    (task) =>
      `${statusColor(task.status, theme)} ${theme.fg("accent", task.taskId)} ${theme.fg("dim", `(${task.profileId}) · ${statusLabel(task.status)}`)}`,
  );
  if (details?.alreadyCollected) footer.push(theme.fg("dim", "Already collected; no new Usage."));
  if (!details?.tasks?.length) {
    const header = theme.fg("accent", `Agent results · ${pending.length} pending`);
    return new Text([header, ...footer].join("\n"), 0, 0);
  }
  const body = renderFinal(details, options.expanded, theme, "Agent results");
  if (!footer.length) return body;
  const container = new Container();
  container.addChild(body);
  container.addChild(new Text(footer.join("\n"), options.expanded ? 1 : 0, 0));
  return container;
}
