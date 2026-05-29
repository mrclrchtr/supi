import { type AgentToolResult, keyText, type Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AskUserParams } from "../schema.ts";
import type { AskUserDetails, AskUserStatus, AskUserToolDetails } from "../types.ts";
import { isErrorDetails } from "../types.ts";
import { formatAnswerSummary, formatMissingHeaders } from "./result.ts";

const COLLAPSED_ANSWER_LIMIT = 2;
const DEFAULT_REVIEW_KEY = "Ctrl+O";

type AskUserRenderOptions = {
  expanded?: boolean;
};

export function renderAskUserCall(args: AskUserParams, theme: Theme): Text {
  const title = args.title?.trim();
  const headers = args.questions.map((question) => question.header.trim()).filter(Boolean);
  const label = title || `${headers.length} question${headers.length === 1 ? "" : "s"}`;
  const suffix = title && headers.length > 0 ? ` (${headers.join(", ")})` : headers.join(", ");
  const text = `${theme.fg("toolTitle", theme.bold("ask_user "))}${theme.fg("muted", label)}${suffix ? theme.fg("dim", ` ${suffix}`) : ""}`;
  return new Text(text, 0, 0);
}

export function renderAskUserResult(
  result: Pick<AgentToolResult<AskUserToolDetails>, "content" | "details">,
  theme: Theme,
  options: AskUserRenderOptions = {},
): Text {
  if (isErrorDetails(result.details)) {
    return new Text(theme.fg("error", result.details.message), 0, 0);
  }

  const lines = options.expanded
    ? buildExpandedResultLines(result.details, theme)
    : buildCollapsedResultLines(result.details, theme);
  return new Text(lines.join("\n"), 0, 0);
}

function buildCollapsedResultLines(details: AskUserDetails, theme: Theme): string[] {
  if (details.status === "cancelled") return [theme.fg("warning", "Cancelled")];
  if (details.status === "aborted") return [theme.fg("error", "Aborted")];

  const answerLines = buildAnswerLines(details, theme);
  const shownAnswerLines = answerLines.slice(0, COLLAPSED_ANSWER_LIMIT);
  const hiddenAnswerCount = Math.max(answerLines.length - shownAnswerLines.length, 0);
  const metaLine = buildCollapsedMetaLine(details, hiddenAnswerCount, theme);

  return [formatStatusLine(details, theme), ...shownAnswerLines, ...(metaLine ? [metaLine] : [])];
}

function buildExpandedResultLines(details: AskUserDetails, theme: Theme): string[] {
  if (details.status === "cancelled") return [theme.fg("warning", "Cancelled")];
  if (details.status === "aborted") return [theme.fg("error", "Aborted")];

  const lines = [formatStatusLine(details, theme)];
  const title = details.title?.trim();
  const intro = details.intro?.trim();
  const discussMessage = details.discussMessage?.trim();
  const missing = formatMissingSummary(details);

  if (title) lines.push(theme.fg("accent", title));
  if (intro) lines.push(theme.fg("text", intro));
  if (details.status === "discuss" && discussMessage) {
    lines.push(theme.fg("text", `Message: ${discussMessage}`));
  }
  if (missing) {
    lines.push(theme.fg("dim", missing));
  }

  for (const question of details.questions) {
    lines.push("");
    lines.push(theme.fg("accent", question.header));
    lines.push(theme.fg("dim", question.prompt));

    const answer = details.answersById[question.id];
    lines.push(
      answer
        ? theme.fg("text", `Answer: ${formatAnswerSummary(question, answer)}`)
        : theme.fg("dim", "Not answered"),
    );
  }

  return lines;
}

function buildAnswerLines(details: AskUserDetails, theme: Theme): string[] {
  return details.questions.flatMap((question) => {
    const answer = details.answersById[question.id];
    return answer
      ? [
          `${theme.fg("success", "✓ ")}${theme.fg("accent", question.header)}: ${theme.fg("text", formatAnswerSummary(question, answer))}`,
        ]
      : [];
  });
}

function buildCollapsedMetaLine(
  details: AskUserDetails,
  hiddenAnswerCount: number,
  theme: Theme,
): string {
  const parts: string[] = [];

  if (details.missingQuestionIds.length > 0) {
    parts.push(`${details.missingQuestionIds.length} required missing`);
  }
  if (details.status === "discuss" && details.discussMessage?.trim()) {
    parts.push("discussion message included");
  }
  if (hiddenAnswerCount > 0) {
    parts.push(`${hiddenAnswerCount} more answer${hiddenAnswerCount === 1 ? "" : "s"}`);
  }

  const reviewKey = keyText("app.tools.expand") || DEFAULT_REVIEW_KEY;
  const reviewHint = `${theme.fg("dim", reviewKey)}${theme.fg("muted", " to review")}`;

  if (parts.length === 0) return reviewHint;
  return `${theme.fg("dim", parts.join(" · "))}${theme.fg("dim", " · ")}${reviewHint}`;
}

function formatStatusLine(details: AskUserDetails, theme: Theme): string {
  const answeredCount = countAnsweredQuestions(details);
  const totalCount = details.questions.length;
  return theme.fg(
    statusColor(details.status),
    `${statusLabel(details.status)} · ${answeredCount}/${totalCount} answered`,
  );
}

function countAnsweredQuestions(details: AskUserDetails): number {
  return details.questions.filter((question) => question.id in details.answersById).length;
}

function formatMissingSummary(details: AskUserDetails): string | undefined {
  const missing = formatMissingHeaders(details.questions, details.missingQuestionIds);
  if (!missing) return undefined;
  return details.status === "partial"
    ? `Missing required: ${missing}`
    : `Still missing: ${missing}`;
}

function statusColor(status: AskUserStatus): "success" | "warning" | "error" {
  switch (status) {
    case "submitted":
      return "success";
    case "partial":
    case "discuss":
    case "cancelled":
      return "warning";
    case "aborted":
      return "error";
  }
}

function statusLabel(status: AskUserStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "partial":
      return "Partial";
    case "discuss":
      return "Discuss";
    case "cancelled":
      return "Cancelled";
    case "aborted":
      return "Aborted";
  }
}
