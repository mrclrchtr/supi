/**
 * TUI renderer for supi_review_run — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type {
  ReviewExecutionPartialTaskState,
  ReviewExecutionProgressDetails,
} from "../tool/review-execution.ts";
import { formatReviewUsage } from "../tool/usage-format.ts";
import type { ReviewBatchDetails, ReviewProgress, ReviewTaskResult } from "../types.ts";
import {
  buildTaskSection,
  formatStatusLabel,
  formatVerdictBadge,
  renderError,
  renderPartial,
  renderReviewToolCall,
} from "./common.ts";

// ── Helpers ──────────────────────────────────────────────────────

/** Format a compact per-task collapsed line. */
function formatTaskCollapsed(result: ReviewTaskResult, theme: Theme): string {
  if (result.status === "completed") {
    const findingCount = result.findings.length;
    const findingLabel =
      findingCount > 0 ? ` (${findingCount} finding${findingCount !== 1 ? "s" : ""})` : "";
    const metadata = [
      `model: ${result.modelId}`,
      ...(result.usage ? [formatReviewUsage(result.usage)] : []),
    ].join(" · ");
    return `${result.taskId}: ${formatVerdictBadge(result.verdict, theme)}${theme.fg("dim", `${findingLabel} · ${metadata}`)}`;
  }
  // Non-completed task — show status
  const label = formatStatusLabel(
    result.status,
    result.status === "failed" ? result.failureCode : undefined,
    result.status === "timeout" ? result.timeoutMs : undefined,
  );
  const metadata = [
    `model: ${result.modelId}`,
    ...(result.usage ? [formatReviewUsage(result.usage)] : []),
  ].join(" · ");
  return `${result.taskId}: ${theme.fg("warning", label)}${theme.fg("dim", ` · ${metadata}`)}`;
}

// ── renderCall ───────────────────────────────────────────────────

export function renderRunCall(args: unknown, theme: Theme): Text {
  const params = (args ?? {}) as {
    mode?: string;
    target?: { kind?: string };
    planId?: string;
  };
  const mode = params.mode ?? "direct";
  const primary = mode;
  const secondary = mode === "prepared" ? "from plan" : (params.target?.kind ?? undefined);

  return renderReviewToolCall("supi_review_run", primary, theme, secondary);
}

// ── renderResult ─────────────────────────────────────────────────

type PartialReviewDetails = ReviewExecutionProgressDetails;

function formatProgress(progress: ReviewProgress): string {
  const parts = [`${progress.turns} turns`, `${progress.toolUses} tool uses`];
  if (progress.tokens) parts.push(`${progress.tokens.total.toLocaleString("en-US")} tokens`);
  return parts.join(" · ");
}

function addPartialPreamble(
  container: Container,
  details: PartialReviewDetails,
  theme: Theme,
): void {
  if (details.targetTitle) {
    container.addChild(new Text(theme.fg("dim", `target: ${details.targetTitle}`), 1, 0));
  }
  container.addChild(
    new Text(
      theme.fg("dim", `workspace: ${details.workspacePath ?? "preparing frozen workspace…"}`),
      1,
      0,
    ),
  );
  if (details.reviewerModelId) {
    container.addChild(new Text(theme.fg("dim", `reviewer: ${details.reviewerModelId}`), 1, 0));
  }
  if (details.sharedContext) {
    container.addChild(new Text(theme.fg("dim", `context: ${details.sharedContext}`), 1, 0));
  }
}

function formatPartialTask(
  taskId: string,
  state: ReviewExecutionPartialTaskState | undefined,
  theme: Theme,
): string {
  const progress = state?.progress ? ` · ${formatProgress(state.progress)}` : "";
  switch (state?.status ?? "waiting") {
    case "running":
      return theme.fg("accent", `● ${taskId}${progress}`);
    case "completed":
      return theme.fg("success", `✓ ${taskId} · complete`);
    case "failed":
    case "canceled":
    case "timeout":
      return theme.fg("warning", `! ${taskId} · ${state?.status}`);
    default:
      return theme.fg("dim", `○ ${taskId} · queued`);
  }
}

function addPartialTasks(container: Container, details: PartialReviewDetails, theme: Theme): void {
  if (!details.taskIds?.length) return;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", theme.bold("Tasks")), 1, 0));
  for (const taskId of details.taskIds) {
    container.addChild(
      new Text(formatPartialTask(taskId, details.taskStates?.[taskId], theme), 1, 0),
    );
    const instructions = details.tasks?.find((task) => task.id === taskId)?.instructions;
    if (instructions) container.addChild(new Text(theme.fg("dim", instructions), 1, 0));
  }
}

function partialLabel(completed: number, total: number): string {
  return total > 0 ? `Reviewing… (${completed} of ${total} tasks finished)` : "Reviewing…";
}

function buildExpandedPartial(details: PartialReviewDetails, theme: Theme): Container {
  const completed = details.completedCount ?? 0;
  const total = details.totalCount ?? 0;
  const label = partialLabel(completed, total);
  const container = new Container();
  container.addChild(renderPartial(label, theme));

  if (
    !details.targetTitle &&
    !details.workspacePath &&
    !details.reviewerModelId &&
    !(details.taskIds?.length ?? 0)
  ) {
    return container;
  }

  container.addChild(new Spacer(1));
  addPartialPreamble(container, details, theme);
  addPartialTasks(container, details, theme);
  return container;
}

export function renderRunResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    isError?: boolean;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Container | Text {
  if (options.isPartial) {
    const details = result.details as PartialReviewDetails | undefined;
    if (options.expanded) return buildExpandedPartial(details ?? {}, theme);
    const completed = details?.completedCount ?? 0;
    const total = details?.totalCount ?? 0;
    return renderPartial(partialLabel(completed, total), theme);
  }

  const details = result.details as ReviewBatchDetails | undefined;

  if (result.isError || !details) {
    return renderError("supi_review_run failed", theme);
  }

  if (!options.expanded) {
    return buildCollapsed(details, theme);
  }

  return buildExpanded(details, theme);
}

// ── Collapsed ────────────────────────────────────────────────────

function buildCollapsed(details: ReviewBatchDetails, theme: Theme): Container {
  const container = new Container();
  for (const result of details.results) {
    container.addChild(new Text(formatTaskCollapsed(result, theme), 0, 0));
    if (result.status === "completed") {
      container.addChild(new Text(theme.fg("muted", result.summary), 0, 0));
    }
    for (const warning of result.capabilityWarnings ?? []) {
      container.addChild(new Text(theme.fg("warning", `capability: ${warning.message}`), 0, 0));
    }
  }

  const { additions, deletions, files } = details.snapshot.stats;
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `${details.snapshot.title} (${files} file${files !== 1 ? "s" : ""} · +${additions.toLocaleString("en-US")} / -${deletions.toLocaleString("en-US")})`,
      ),
      0,
      0,
    ),
  );
  return container;
}

// ── Expanded ─────────────────────────────────────────────────────

function buildExpanded(details: ReviewBatchDetails, theme: Theme): Container {
  const container = new Container();

  // Header
  const provenanceLabel =
    details.provenance === "planner-assisted"
      ? theme.fg("muted", "(planner-assisted)")
      : theme.fg("dim", "(caller-supplied)");
  container.addChild(
    new Text(`${theme.fg("accent", theme.bold("Review Finished"))}  ${provenanceLabel}`, 1, 0),
  );
  container.addChild(new Spacer(1));

  // Preamble: mode + target
  container.addChild(
    new Text(`${theme.fg("dim", "mode:")} ${theme.fg("muted", details.mode)}`, 1, 0),
  );
  container.addChild(
    new Text(`${theme.fg("dim", "target:")} ${theme.fg("muted", details.snapshot.title)}`, 1, 0),
  );
  const fileCount = details.snapshot.changes.length;
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `${fileCount} file${fileCount !== 1 ? "s" : ""} changed · +${details.snapshot.stats.additions} / -${details.snapshot.stats.deletions}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `workspace: ${details.workspaceReceipt.status} · ${details.workspaceReceipt.targetKind} · ${details.workspaceReceipt.changedPathCount} paths`,
      ),
      1,
      0,
    ),
  );

  if (details.cleanupWarning) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg("warning", `cleanup: ${details.cleanupWarning.message}`), 1, 0),
    );
    container.addChild(new Text(theme.fg("dim", details.cleanupWarning.workspacePath), 1, 0));
  }

  // Planning info
  if (details.planning) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        `${theme.fg("dim", "planner:")} ${theme.fg("muted", details.planning.modelId)} · ${theme.fg("dim", "decision:")} ${theme.fg("muted", details.planning.decision)}`,
        1,
        0,
      ),
    );
    if (details.planning.usage) {
      container.addChild(
        new Text(
          theme.fg("dim", `planner usage: ${formatReviewUsage(details.planning.usage)}`),
          1,
          0,
        ),
      );
    }
  }

  // Per-task sections
  for (const result of details.results) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("accent", theme.bold(result.taskId)), 1, 0));
    container.addChild(new Text(theme.fg("dim", "─".repeat(40)), 1, 0));
    buildTaskSection(container, result, theme);
  }

  return container;
}
