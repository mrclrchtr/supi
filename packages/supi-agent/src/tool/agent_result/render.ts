import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Container, Text } from "@earendil-works/pi-tui";
import type { BatchProgressState, BatchTaskResult } from "../agent_run/batch-types.ts";
import { renderPartial } from "../agent_run/render.ts";
import type { AgentRunResultDetails } from "../agent_run/result.ts";
import { renderBatchCall, renderBatchError } from "../background-render.ts";

/** Render the collection handle without task instructions. */
export function renderCall(args: unknown, theme: Theme): Text {
  return renderBatchCall("Agent Result", args, theme);
}

/** Keep result counts separate from output, and show bounded output only when expanded. */
export function renderResult(
  result: { details?: unknown; content?: { type: string; text?: string }[] },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError?: boolean } = {},
): Container | Text {
  if (context.isError) return renderBatchError(result, theme);
  if (options.isPartial) {
    const progress = result.details as Partial<BatchProgressState> | undefined;
    if (!progress?.tasks) return new Text(theme.fg("dim", "Waiting for Agent Run results…"), 0, 0);
    return renderPartial(
      progress as BatchProgressState,
      options.expanded,
      theme,
      "Waiting for Agent Run",
    );
  }
  const details = result.details as
    | (AgentRunResultDetails & {
        complete?: boolean;
        alreadyCollected?: boolean;
        pending?: { taskId: string; status: string }[];
      })
    | undefined;
  const tasks = details?.tasks ?? [];
  const pending = details?.pending ?? [];
  const lines = [
    theme.fg("accent", `Agent results · ${tasks.length} ready · ${pending.length} pending`),
  ];
  if (details?.alreadyCollected) lines.push(theme.fg("dim", "Already collected; no new Usage."));
  if (options.expanded) {
    for (const task of tasks) lines.push(...renderTaskLines(task, theme));
    for (const task of pending) lines.push(theme.fg("dim", `${task.taskId} · ${task.status}`));
    if (details?.fullOutputPath)
      lines.push(theme.fg("dim", `Full output: ${details.fullOutputPath}`));
  }
  return new Text(lines.join("\n"), 0, 0);
}

function renderTaskLines(task: BatchTaskResult, theme: Theme): string[] {
  const lines = [theme.fg("accent", `${task.taskId} (${task.profileId}) · ${task.status}`)];
  if (task.modelId)
    lines.push(
      theme.fg(
        "dim",
        `model: ${task.modelId}${task.thinkingLevel ? ` · thinking: ${task.thinkingLevel}` : ""}`,
      ),
    );
  if (task.failureCode) lines.push(theme.fg("warning", task.failureCode));
  if (task.failureSummary) lines.push(theme.fg("warning", task.failureSummary));
  if (task.finalTextFull) lines.push(task.finalTextFull);
  if (task.humanTruncated || task.modelTruncated) lines.push(theme.fg("dim", "Output truncated."));
  return lines;
}
