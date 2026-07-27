/**
 * TUI renderer for supi_review_prepare — renderCall + renderResult.
 *
 * Dual-surface rendering: chrome built from details, markdown body excluded.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
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
  if (hasPlanner) {
    segments.push(theme.fg("muted", "with draft"));
  }

  return new Text(segments.join(` ${theme.fg("dim", "·")} `), 0, 0);
}

// ── Expanded ─────────────────────────────────────────────────────

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

  // Model info
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("dim", `Reviewer model: ${details.reviewerModelId}`), 1, 0));
  if (details.plannerModelId) {
    container.addChild(new Text(theme.fg("dim", `Planner model: ${details.plannerModelId}`), 1, 0));
  }

  // Planner draft
  if (details.plannerDraft) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("accent", theme.bold("Planner Draft")), 1, 0));
    if (details.plannerDraft.sharedContext) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", details.plannerDraft.sharedContext), 1, 0));
    }
    if (details.plannerDraft.tasks.length > 0) {
      container.addChild(new Spacer(1));
      for (const task of details.plannerDraft.tasks) {
        container.addChild(
          new Text(`${theme.fg("accent", task.id)}: ${theme.fg("muted", task.instructions)}`, 1, 0),
        );
        container.addChild(new Text(theme.fg("dim", "─".repeat(40)), 1, 0));
      }
    }
  }

  return container;
}
