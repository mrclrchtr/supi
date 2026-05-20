import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { AskUserParams } from "../schema.ts";
import type { AskUserDetails, AskUserToolDetails } from "../types.ts";
import { isErrorDetails } from "../types.ts";
import { formatAnswerSummary, formatMissingHeaders } from "./result.ts";

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
): Text {
  if (isErrorDetails(result.details)) {
    return new Text(theme.fg("error", result.details.message), 0, 0);
  }

  const lines = buildResultLines(result.details, theme);
  return new Text(lines.join("\n"), 0, 0);
}

function buildResultLines(details: AskUserDetails, theme: Theme): string[] {
  const answersById = details.answersById;
  const answerLines = details.questions.flatMap((question) => {
    const answer = answersById[question.id];
    return answer
      ? [
          `${theme.fg("success", "✓ ")}${theme.fg("accent", question.header)}: ${theme.fg("text", formatAnswerSummary(question, answer))}`,
        ]
      : [];
  });

  switch (details.status) {
    case "submitted":
      return answerLines.length > 0 ? answerLines : [theme.fg("success", "Submitted")];
    case "partial": {
      const missing = formatMissingHeaders(details.questions, details.missingQuestionIds);
      return [
        theme.fg("warning", "Partial"),
        ...answerLines,
        ...(missing ? [theme.fg("dim", `Missing required: ${missing}`)] : []),
      ];
    }
    case "discuss": {
      const missing = formatMissingHeaders(details.questions, details.missingQuestionIds);
      return [
        theme.fg("warning", "Discuss"),
        ...(details.discussMessage ? [theme.fg("text", `Message: ${details.discussMessage}`)] : []),
        ...answerLines,
        ...(missing ? [theme.fg("dim", `Still missing: ${missing}`)] : []),
      ];
    }
    case "cancelled":
      return [theme.fg("warning", "Cancelled")];
    case "aborted":
      return [theme.fg("error", "Aborted")];
  }
}
