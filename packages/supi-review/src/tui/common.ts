/**
 * Shared TUI rendering helpers for supi-review tool output.
 *
 * Dual-surface rendering: chrome built from details, markdown body excluded.
 * Follows the tool-rendering convention in docs/conventions/tool-rendering.md.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Container, Spacer, Text } from "@earendil-works/pi-tui";
import { formatEvidenceBadge } from "@mrclrchtr/supi-core/evidence-badge";
import { getChildDiagnosticErrorRows } from "../tool/review_run/child-failures.ts";
import { formatReviewUsage } from "../tool/usage-format.ts";
import type {
  ChildFailureDiagnostics,
  FindingEffort,
  FindingImpact,
  ReviewFinding,
  ReviewTaskResult,
  TaskVerdict,
} from "../types.ts";

// ── Spinner state ────────────────────────────────────────────────

/** Progress indicator shown while the tool is still running. */
export function renderPartial(label: string, theme: Theme): Text {
  return new Text(theme.fg("warning", `● ${label}`), 0, 0);
}

/** Error state when the tool fails. */
export function renderError(label: string, theme: Theme): Text {
  return new Text(theme.fg("error", label), 0, 0);
}

// ── Verdict / status badges ──────────────────────────────────────

/** Colored verdict label that distinguishes acceptance with advisory findings. */
export function formatVerdictBadge(verdict: TaskVerdict, theme: Theme): string {
  if (verdict === "pass") return theme.fg("success", theme.bold("PASS"));
  if (verdict === "pass_with_findings") {
    return theme.fg("warning", theme.bold("PASS WITH FINDINGS"));
  }
  if (verdict === "incomplete") return theme.fg("warning", theme.bold("INCOMPLETE"));
  return theme.fg("error", theme.bold("ISSUES"));
}

/** Colored status label for non-completed task results. */
export function formatStatusLabel(
  status: "failed" | "canceled" | "timeout",
  failureCode?: string,
  timeoutMs?: number,
): string {
  switch (status) {
    case "failed":
      return `FAILED${failureCode ? ` (${failureCode})` : ""}`;
    case "canceled":
      return "CANCELED";
    case "timeout":
      return `TIMEOUT (${timeoutMs} ms)`;
  }
}

// ── Finding badges ───────────────────────────────────────────────

const IMPACT_LABEL: Record<FindingImpact, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

const EFFORT_LABEL: Record<FindingEffort, string> = {
  small: "small",
  medium: "medium",
  large: "large",
};

/** Build a compact finding summary line with impact, effort, and confidence badges. */
export function formatFindingLine(finding: ReviewFinding, theme: Theme): string {
  const blocking = finding.blocksAcceptance
    ? theme.fg("error", "BLOCKING")
    : theme.fg("muted", "non-blocking");
  const impact = theme.fg("dim", `impact: ${IMPACT_LABEL[finding.impact]}`);
  const effort = theme.fg("dim", `effort: ${EFFORT_LABEL[finding.effort]}`);
  const confidence = theme.fg("dim", `confidence: ${finding.confidence.toFixed(1)}`);
  return `[${blocking}] ${theme.fg("accent", finding.title)} · ${impact} · ${effort} · ${confidence}`;
}

// ── Tool call rendering ──────────────────────────────────────────

/** Compact single-line renderCall shared by both review tools. */
export function renderReviewToolCall(
  name: string,
  primary: string,
  theme: Theme,
  secondary?: string,
): Text {
  let content = theme.fg("toolTitle", name);
  if (primary) {
    content += ` ${theme.fg("accent", primary)}`;
  }
  if (secondary) {
    content += theme.fg("dim", ` — ${secondary}`);
  }
  return new Text(content, 0, 0);
}

// ── Task section (expanded) ──────────────────────────────────────

function formatThinkingLevel(result: ReviewTaskResult): string {
  return result.requestedThinkingLevel === result.effectiveThinkingLevel
    ? `Thinking: ${result.requestedThinkingLevel}`
    : `Thinking: ${result.requestedThinkingLevel} clamped to ${result.effectiveThinkingLevel}`;
}

/** Render a single finding's details into the container. */
function renderFinding(container: Container, finding: ReviewFinding, theme: Theme): void {
  container.addChild(new Text(formatFindingLine(finding, theme), 1, 0));
  if (finding.location) {
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          `  ${finding.location.path}:${finding.location.startLine}-${finding.location.endLine}`,
        ),
        1,
        0,
      ),
    );
  }
  container.addChild(new Text(theme.fg("text", `  ${finding.description}`), 1, 0));
  container.addChild(new Spacer(1));
}

/** Build a compact diagnostics section for non-completed (failed/canceled/timeout) task results. */
function buildNonCompletedSection(
  container: Container,
  result: ReviewTaskResult & { status: "failed" | "canceled" | "timeout" },
  theme: Theme,
): void {
  const diagnostics: ChildFailureDiagnostics | undefined =
    "diagnostics" in result ? result.diagnostics : undefined;
  if (!diagnostics) return;

  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      theme.fg("dim", `${diagnostics.turns} turns · ${diagnostics.toolUses} tool uses`),
      1,
      0,
    ),
  );

  if (diagnostics.lastAssistantStopReason) {
    container.addChild(
      new Text(
        theme.fg(
          diagnostics.lastAssistantStopReason === "error" ? "error" : "dim",
          `Last assistant stop: ${diagnostics.lastAssistantStopReason}`,
        ),
        1,
        0,
      ),
    );
  }

  const errors = getChildDiagnosticErrorRows(diagnostics);
  for (const error of errors) {
    container.addChild(new Text(theme.fg("error", `${error.label}: ${error.text}`), 1, 0));
  }
  if (errors.length === 0 && diagnostics.lastAssistantStopReason === "error") {
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          "The model produced an error with no further details — check provider quota, auth, or configuration.",
        ),
        1,
        0,
      ),
    );
  }
}

function appendSubmissionRecovery(
  container: Container,
  result: ReviewTaskResult,
  theme: Theme,
): void {
  const recovery = result.submissionRecovery;
  if (!recovery) return;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("dim", `submission recovery: ${recovery.status}`), 1, 0));
  for (const attempt of recovery.attempts) {
    container.addChild(new Text(theme.fg("dim", `  ${attempt.modelId}: ${attempt.outcome}`), 1, 0));
  }
  if (recovery.declineReason) {
    container.addChild(new Text(theme.fg("warning", recovery.declineReason), 1, 0));
  }
}

function appendCapabilityWarnings(
  container: Container,
  result: ReviewTaskResult,
  theme: Theme,
): void {
  for (const warning of result.capabilityWarnings ?? []) {
    container.addChild(new Text(theme.fg("warning", `capability: ${warning.message}`), 1, 0));
  }
}

function appendCriteriaCoverage(
  container: Container,
  result: ReviewTaskResult & { status: "completed" },
  theme: Theme,
): void {
  if (result.criteriaCoverage?.status !== "incomplete") return;
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      theme.fg(
        "warning",
        `criteria coverage: incomplete — ${result.criteriaCoverage.reason ?? "unspecified"}`,
      ),
      1,
      0,
    ),
  );
}

/** Build an expanded-view section for a single review task result. */
export function buildTaskSection(
  container: Container,
  result: ReviewTaskResult,
  theme: Theme,
): void {
  // Header
  const verdictOrStatus =
    result.status === "completed"
      ? formatVerdictBadge(result.verdict, theme)
      : theme.fg(
          "warning",
          formatStatusLabel(
            result.status,
            result.status === "failed" ? result.failureCode : undefined,
            result.status === "timeout" ? result.timeoutMs : undefined,
          ),
        );

  const findingCount =
    result.status === "completed"
      ? formatEvidenceBadge({
          shownCount: result.findings.length,
          totalCount: result.findings.length,
          omittedCount: 0,
          partialReason: null,
          label: result.findings.length === 1 ? "finding" : "findings",
        })
      : "";

  const headerParts = [verdictOrStatus];
  if (findingCount) headerParts.push(theme.fg("muted", findingCount));
  container.addChild(new Text(headerParts.join("  "), 1, 0));

  const metaParts = [
    theme.fg("dim", `model: ${result.modelId}`),
    theme.fg("dim", `hash: ${result.packetHash.slice(0, 12)}…`),
    theme.fg("dim", formatThinkingLevel(result)),
    ...(result.usage ? [theme.fg("dim", formatReviewUsage(result.usage))] : []),
  ];
  container.addChild(new Text(metaParts.join("  "), 1, 0));
  if (result.audit) {
    container.addChild(new Text(theme.fg("dim", `local replay: ${result.audit.artifactId}`), 1, 0));
  }
  appendCapabilityWarnings(container, result, theme);
  appendSubmissionRecovery(container, result, theme);

  // Completed task — show summary and findings
  if (result.status !== "completed") {
    buildNonCompletedSection(container, result, theme);
    return;
  }

  appendCriteriaCoverage(container, result, theme);

  if (result.summary) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", result.summary), 1, 0));
  }

  if (result.findings.length === 0) return;

  container.addChild(new Spacer(1));
  for (const finding of result.findings) {
    renderFinding(container, finding, theme);
  }
}
