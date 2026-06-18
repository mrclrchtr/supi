import { type AgentToolResult, keyText, type Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AskUserParams } from "../schema.ts";
import type {
  AskUserDetails,
  AskUserOutcomeKind,
  AskUserResponse,
  AskUserToolDetails,
  NormalizedQuestion,
} from "../types.ts";
import { isErrorDetails } from "../types.ts";

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
  const answerLines = buildAnswerLines(details, theme);
  const shownAnswerLines = answerLines.slice(0, COLLAPSED_ANSWER_LIMIT);
  const hiddenAnswerCount = Math.max(answerLines.length - shownAnswerLines.length, 0);
  const metaLine = buildCollapsedMetaLine(details, hiddenAnswerCount, theme);

  return [formatStatusLine(details, theme), ...shownAnswerLines, ...(metaLine ? [metaLine] : [])];
}

function buildExpandedResultLines(details: AskUserDetails, theme: Theme): string[] {
  const lines = [formatStatusLine(details, theme)];
  const title = details.title?.trim();
  const intro = details.intro?.trim();
  const comment = details.comment?.trim();
  const unansweredCount = details.responses.filter((r) => !r.answer.answered).length;

  if (title) lines.push(theme.fg("accent", title));
  if (intro) lines.push(theme.fg("text", intro));
  if (comment) lines.push(theme.fg("text", `Comment: ${comment}`));

  for (const question of details.questions) {
    lines.push("");
    lines.push(theme.fg("accent", question.header));
    lines.push(theme.fg("dim", question.prompt));

    const resp = details.responses.find((r) => r.questionId === question.id);
    if (resp) {
      lines.push(...formatResponseLines(resp, question, theme));
      if (resp.questionComment) {
        lines.push(theme.fg("dim", `  Question comment: ${resp.questionComment}`));
      }
    } else {
      lines.push(theme.fg("dim", "Not answered"));
    }
  }

  if (unansweredCount > 0 && details.outcome === "needs_discussion") {
    lines.push("");
    lines.push(
      theme.fg("dim", `${unansweredCount} question${unansweredCount > 1 ? "s" : ""} unanswered`),
    );
  }

  return lines;
}

function buildAnswerLines(details: AskUserDetails, theme: Theme): string[] {
  return details.responses.flatMap((resp) => {
    if (!resp.answer.answered) return [];
    const question = details.questions.find((q) => q.id === resp.questionId);
    if (!question) return [];

    const summary = formatAnswerLine(resp);
    return summary
      ? [
          `${theme.fg("success", "\u2713 ")}${theme.fg("accent", question.header)}: ${theme.fg("text", summary)}`,
        ]
      : [];
  });
}

function formatAnswerLine(resp: AskUserResponse): string | undefined {
  if (!resp.answer.answered) return undefined;

  if (resp.answer.kind === "choice") {
    const selected = resp.answer.options.filter((o) => o.selected);
    if (selected.length === 0) return undefined;
    return selected
      .map((o) => (o.comment ? `${o.label} (comment: ${o.comment})` : o.label))
      .join("; ");
  }

  if (resp.answer.kind === "text" && resp.answer.value) {
    return resp.answer.value;
  }

  return undefined;
}

function formatResponseLines(
  resp: AskUserResponse,
  question: NormalizedQuestion,
  theme: Theme,
): string[] {
  if (resp.answer.kind === "choice") {
    const multi = question.type === "choice" && question.multi;
    const optionLines = resp.answer.options.map((opt) => {
      const selected = opt.selected
        ? theme.fg("success", multi ? "[x]" : "(*)")
        : theme.fg("dim", multi ? "[ ]" : "( )");
      const comment = opt.comment ? theme.fg("dim", ` (comment: ${opt.comment})`) : "";
      return `${selected} ${opt.label}${comment}`;
    });

    if (resp.answer.answered) return optionLines;
    return [theme.fg("dim", "Not answered"), ...optionLines];
  }

  if (resp.answer.kind === "text" && resp.answer.answered && resp.answer.value) {
    return [theme.fg("text", resp.answer.value)];
  }

  return [theme.fg("dim", "Not answered")];
}

function buildCollapsedMetaLine(
  details: AskUserDetails,
  hiddenAnswerCount: number,
  theme: Theme,
): string {
  const parts: string[] = [];
  const unansweredCount = details.responses.filter((r) => !r.answer.answered).length;

  if (unansweredCount > 0) {
    parts.push(`${unansweredCount} unanswered`);
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
  const answeredCount = details.responses.filter((r) => r.answer.answered).length;
  const totalCount = details.responses.length;
  return theme.fg(
    statusColor(details.outcome),
    `${statusLabel(details.outcome)} \u00B7 ${answeredCount}/${totalCount} answered`,
  );
}

function statusColor(outcome: AskUserOutcomeKind): "success" | "warning" | "error" {
  switch (outcome) {
    case "submitted":
      return "success";
    case "needs_discussion":
      return "warning";
  }
}

function statusLabel(outcome: AskUserOutcomeKind): string {
  switch (outcome) {
    case "submitted":
      return "Submitted";
    case "needs_discussion":
      return "Needs discussion";
  }
}
