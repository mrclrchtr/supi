/** TUI renderer for review_run. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type {
  ReviewExecutionPartialTaskState,
  ReviewExecutionProgressDetails,
} from "../tool/review_run/execution.ts";
import { REVIEW_RUN_TOOL_NAME } from "../tool/review_run/spec.ts";
import { formatReviewUsage } from "../tool/usage-format.ts";
import type {
  ReviewBatchDetails,
  ReviewProgress,
  ReviewScope,
  ReviewTaskResult,
} from "../types.ts";
import {
  buildTaskSection,
  formatStatusLabel,
  formatVerdictBadge,
  renderError,
  renderPartial,
  renderReviewToolCall,
} from "./common.ts";

function formatTaskCollapsed(result: ReviewTaskResult, theme: Theme): string {
  const warnings = result.capabilityWarnings?.length ?? 0;
  const warningLabel =
    warnings > 0 ? ` · ${warnings} capability warning${warnings === 1 ? "" : "s"}` : "";
  if (result.status === "completed") {
    const findings = result.findings.length;
    const findingLabel = findings > 0 ? ` · ${findings} finding${findings === 1 ? "" : "s"}` : "";
    return `${result.taskId}: ${formatVerdictBadge(result.verdict, theme)}${theme.fg("dim", ` · ${result.mode}${findingLabel}${warningLabel}`)}`;
  }
  const label = formatStatusLabel(
    result.status,
    result.status === "failed" ? result.failureCode : undefined,
    result.status === "timeout" ? result.timeoutMs : undefined,
  );
  return `${result.taskId}: ${theme.fg("warning", label)}${theme.fg("dim", ` · ${result.mode}${warningLabel}`)}`;
}

function formatScopeCount(scope: ReviewScope | undefined): string {
  const count = scope?.paths?.length ?? 0;
  if (count === 0) return "repository-wide";
  return `path focus: ${count} ${count === 1 ? "path" : "paths"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quotedEndpoint(value: unknown): string | undefined {
  return typeof value === "string" ? JSON.stringify(value) : undefined;
}

function formatRequestedTarget(target: unknown): string {
  if (!isRecord(target)) return "requested target: current filesystem";
  const from = quotedEndpoint(target.from);
  const to = quotedEndpoint(target.to);
  const includeUncommittedChanges = target.includeUncommittedChanges !== false;
  if (!from && !to && includeUncommittedChanges) return "requested target: current filesystem";

  const endpoints = [
    ...(from ? [`from ${from}`] : []),
    ...(to ? [`to ${to}`] : []),
    ...(!to && !includeUncommittedChanges ? ['default to "HEAD"'] : []),
  ];
  return `requested target: ${endpoints.join(" · ")} · ${includeUncommittedChanges ? "uncommitted changes included" : "uncommitted changes excluded"}`;
}

function formatTaskModes(tasks: unknown): string {
  if (!Array.isArray(tasks)) return "task modes: unspecified";
  const modes = new Set(
    tasks.flatMap((task) =>
      isRecord(task) && (task.mode === "change" || task.mode === "state") ? [task.mode] : [],
    ),
  );
  const orderedModes = ["change", "state"].filter((mode) => modes.has(mode));
  return orderedModes.length > 0
    ? `task modes: ${orderedModes.join(", ")}`
    : "task modes: unspecified";
}

/** Render requested Review Target facts, task-owned Review Modes, and Review Scope. */
export function renderRunCall(args: unknown, theme: Theme): Text {
  const params = isRecord(args) ? args : {};
  const paths = params.paths;
  const scope =
    Array.isArray(paths) && paths.every((path): path is string => typeof path === "string")
      ? { paths }
      : undefined;
  const detail = [
    formatRequestedTarget(params.target),
    formatTaskModes(params.tasks),
    formatScopeCount(scope),
  ].join(" · ");
  return renderReviewToolCall(REVIEW_RUN_TOOL_NAME, "review", theme, detail);
}

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
  container.addChild(new Text(theme.fg("dim", `focus: ${formatScopeCount(details.scope)}`), 1, 0));
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
    const task = details.tasks?.find((candidate) => candidate.id === taskId);
    if (task) {
      container.addChild(new Text(theme.fg("dim", `${task.mode}: ${task.instructions}`), 1, 0));
    }
  }
}

function partialLabel(completed: number, total: number): string {
  return total > 0 ? `Reviewing… (${completed} of ${total} tasks finished)` : "Reviewing…";
}

function buildExpandedPartial(details: PartialReviewDetails, theme: Theme): Container {
  const completed = details.completedCount ?? 0;
  const total = details.totalCount ?? 0;
  const container = new Container();
  container.addChild(renderPartial(partialLabel(completed, total), theme));
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

/** Render either progressing or completed review state. */
export function renderRunResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError: boolean } = { isError: false },
): Container | Text {
  if (options.isPartial) {
    const details = result.details as PartialReviewDetails | undefined;
    if (options.expanded) return buildExpandedPartial(details ?? {}, theme);
    return renderPartial(
      partialLabel(details?.completedCount ?? 0, details?.totalCount ?? 0),
      theme,
    );
  }
  const details = result.details as ReviewBatchDetails | undefined;
  if (context.isError || !details) {
    return renderError(`${REVIEW_RUN_TOOL_NAME} failed`, theme);
  }
  return options.expanded ? buildExpanded(details, theme) : buildCollapsed(details, theme);
}

function buildCollapsed(details: ReviewBatchDetails, theme: Theme): Text {
  const tasks = details.results
    .map((result) => formatTaskCollapsed(result, theme))
    .join(` ${theme.fg("dim", "·")} `);
  const anyChange = details.results.some((result) => result.mode === "change");
  const { additions, deletions, files } = details.snapshot.stats;
  const targetDetail = anyChange
    ? `${files} file${files !== 1 ? "s" : ""} · +${additions.toLocaleString("en-US")} / -${deletions.toLocaleString("en-US")}`
    : "frozen after state";
  return new Text(
    `${tasks}\n${theme.fg("dim", `${details.snapshot.title} · ${formatScopeCount(details.scope)} (${targetDetail})`)}`,
    0,
    0,
  );
}

function buildExpanded(details: ReviewBatchDetails, theme: Theme): Container {
  const container = new Container();
  const provenanceLabel =
    details.provenance === "planner-assisted"
      ? theme.fg("muted", "(planner-assisted)")
      : theme.fg("dim", "(caller-supplied)");
  container.addChild(
    new Text(`${theme.fg("accent", theme.bold("Review Finished"))}  ${provenanceLabel}`, 1, 0),
  );
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(`${theme.fg("dim", "target:")} ${theme.fg("muted", details.snapshot.title)}`, 1, 0),
  );
  container.addChild(new Text(theme.fg("dim", `focus: ${formatScopeCount(details.scope)}`), 1, 0));
  const receipt = details.workspaceReceipt;
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `workspace: ${receipt.status} · from ${receipt.fromCommit ?? "none"} · to ${receipt.toCommit} · ${receipt.includeUncommittedChanges ? "filesystem frozen" : "committed state"}`,
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
  if (details.planning) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        `${theme.fg("dim", "planner:")} ${theme.fg("muted", details.planning.modelId)} · ${theme.fg("dim", `protocol ${details.planning.promptVersion}`)}`,
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
  for (const result of details.results) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg("accent", theme.bold(`${result.taskId} (${result.mode})`)), 1, 0),
    );
    container.addChild(new Text(theme.fg("dim", "─".repeat(40)), 1, 0));
    buildTaskSection(container, result, theme);
  }
  return container;
}
