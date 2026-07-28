/**
 * TUI renderer for supi_review_prepare — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatReviewUsage } from "../tool/usage-format.ts";
import type { PreparedReviewDetails } from "../types.ts";
import { renderError, renderPartial, renderReviewToolCall } from "./common.ts";

/** Plan details shape extracted from execute's details return. */
interface PrepareDetails extends PreparedReviewDetails {
  plannerDraft?: {
    sharedContext?: string;
    tasks: Array<{ id: string; instructions: string }>;
  };
}

// ── renderCall ───────────────────────────────────────────────────

export function renderPrepareCall(args: unknown, theme: Theme): Text {
  const params = (args ?? {}) as {
    planning?: string;
    target?: { kind?: string };
  };
  const planning = params.planning ?? "none";
  const targetKind = params.target?.kind ?? "working-tree";

  return renderReviewToolCall("supi_review_prepare", planning, theme, targetKind);
}

// ── renderResult ─────────────────────────────────────────────────

export function renderPrepareResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    isError?: boolean;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Container | Text {
  if (options.isPartial) return renderPartial("Preparing review…", theme);

  const details = result.details as PrepareDetails | undefined;

  if (result.isError || !details) {
    return renderError("supi_review_prepare failed", theme);
  }

  if (!options.expanded) {
    return buildCollapsed(details, theme);
  }

  return buildExpanded(details, theme);
}

// ── Collapsed ────────────────────────────────────────────────────

function buildCollapsed(details: PrepareDetails, theme: Theme): Text {
  const fileCount = details.snapshot.changedFiles.length;
  const targetKind = details.snapshot.requestedTarget.kind;
  const hasPlanner = details.plannerDraft !== undefined;

  const segments: string[] = [];
  segments.push(theme.fg("accent", "Plan ready"));
  segments.push(theme.fg("muted", targetKind));
  segments.push(theme.fg("dim", `${fileCount} file${fileCount !== 1 ? "s" : ""} changed`));
  if (hasPlanner) segments.push(theme.fg("muted", "with draft"));
  else if (details.plannerFailure) segments.push(theme.fg("warning", "planner unavailable"));

  return new Text(segments.join(` ${theme.fg("dim", "·")} `), 0, 0);
}

// ── Expanded ─────────────────────────────────────────────────────

function plannerFailureReason(details: PrepareDetails): string | undefined {
  const failure = details.plannerFailure;
  if (!failure) return undefined;
  if (failure.kind === "failed") return failure.failureCode;
  if (failure.kind === "timeout") return `timeout (${failure.timeoutMs} ms)`;
  return failure.kind;
}

function addPlannerMetadata(container: Container, details: PrepareDetails, theme: Theme): void {
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("dim", `Reviewer model: ${details.reviewerModelId}`), 1, 0));
  if (details.plannerModelId) {
    container.addChild(new Text(theme.fg("dim", `Planner model: ${details.plannerModelId}`), 1, 0));
  }
  if (details.plannerUsage) {
    container.addChild(
      new Text(theme.fg("dim", `Planner usage: ${formatReviewUsage(details.plannerUsage)}`), 1, 0),
    );
  }
  const failure = plannerFailureReason(details);
  if (failure) {
    container.addChild(
      new Text(
        theme.fg("warning", `Planner unavailable (${failure}); use-review remains available.`),
        1,
        0,
      ),
    );
  }
}

function addPlannerDraft(container: Container, details: PrepareDetails, theme: Theme): void {
  const draft = details.plannerDraft;
  if (!draft) return;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", theme.bold("Planner Draft")), 1, 0));
  if (draft.sharedContext) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", draft.sharedContext), 1, 0));
  }
  if (draft.tasks.length === 0) return;
  container.addChild(new Spacer(1));
  for (const task of draft.tasks) {
    container.addChild(
      new Text(`${theme.fg("accent", task.id)}: ${theme.fg("muted", task.instructions)}`, 1, 0),
    );
    container.addChild(new Text(theme.fg("dim", "─".repeat(40)), 1, 0));
  }
}

function buildExpanded(details: PrepareDetails, theme: Theme): Container {
  const container = new Container();

  // Header
  container.addChild(new Text(theme.fg("accent", theme.bold("Review Plan Prepared")), 1, 0));
  container.addChild(new Spacer(1));

  // Plan identity
  container.addChild(new Text(theme.fg("muted", `Plan ID: ${details.planId}`), 1, 0));

  // Target info
  const snapshot = details.snapshot;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", theme.bold("Target")), 1, 0));
  container.addChild(new Text(theme.fg("muted", snapshot.title), 1, 0));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `${snapshot.changedFiles.length} file${snapshot.changedFiles.length !== 1 ? "s" : ""} changed · +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
      ),
      1,
      0,
    ),
  );

  addPlannerMetadata(container, details, theme);
  addPlannerDraft(container, details, theme);
  return container;
}
