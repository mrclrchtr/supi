/**
 * TUI renderer for supi_review_run — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { ReviewBatchDetails, ReviewTaskResult } from "../types.ts";
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
    return `${result.taskId}: ${formatVerdictBadge(result.verdict, theme)}${theme.fg("dim", findingLabel)}`;
  }
  // Non-completed task — show status
  const label = formatStatusLabel(
    result.status,
    result.status === "failed" ? result.failureCode : undefined,
    result.status === "timeout" ? result.timeoutMs : undefined,
  );
  return `${result.taskId}: ${theme.fg("warning", label)}`;
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
    const details = result.details as { completedCount?: number; totalCount?: number } | undefined;
    const completed = details?.completedCount ?? 0;
    const total = details?.totalCount ?? 0;
    const label = total > 0 ? `Reviewing… (${completed} of ${total} tasks complete)` : "Reviewing…";
    return renderPartial(label, theme);
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
  const taskLines = details.results.map((r) => formatTaskCollapsed(r, theme));
  const fileCount = details.snapshot.changedFiles.length;

  const container = new Container();
  // Per-task verdicts
  container.addChild(new Text(taskLines.join(` ${theme.fg("dim", "·")} `), 0, 0));
  // Target summary
  container.addChild(
    new Text(
      theme.fg("dim", `${details.snapshot.title} (${fileCount} file${fileCount !== 1 ? "s" : ""})`),
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
    new Text(`${theme.fg("accent", theme.bold("Review Complete"))}  ${provenanceLabel}`, 1, 0),
  );
  container.addChild(new Spacer(1));

  // Preamble: mode + target
  container.addChild(
    new Text(`${theme.fg("dim", "mode:")} ${theme.fg("muted", details.mode)}`, 1, 0),
  );
  container.addChild(
    new Text(`${theme.fg("dim", "target:")} ${theme.fg("muted", details.snapshot.title)}`, 1, 0),
  );
  const fileCount = details.snapshot.changedFiles.length;
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
