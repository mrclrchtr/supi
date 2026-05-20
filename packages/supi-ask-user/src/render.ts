// Custom renderCall / renderResult for the `ask_user` tool. Keeps the in-line
// session transcript readable: a one-line "asking N questions: …" header on
// the call, and a compact ✓ / cancelled / aborted summary on the result.

import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatSummaryBody } from "./format.ts";
import { ASK_USER_ERROR_MARKER } from "./result.ts";
import type { AskUserParams } from "./schema.ts";
import type { AskUserDetails, NormalizedQuestion } from "./types.ts";

export function renderAskUserCall(args: AskUserParams, theme: Theme): Text {
  const headers = extractHeadersFromArgs(args);
  const count = headers.length;
  let text = theme.fg("toolTitle", theme.bold("ask_user "));
  text += theme.fg("muted", `${count || "?"} question${count === 1 ? "" : "s"}`);
  if (count > 0) {
    text += theme.fg("dim", ` (${headers.join(", ")})`);
  }
  return new Text(text, 0, 0);
}

export function renderAskUserResult(
  result: Pick<AgentToolResult<AskUserDetails>, "content" | "details">,
  theme: Theme,
): Text {
  if (isErrorDetails(result.details)) {
    return new Text(theme.fg("error", firstTextBlock(result.content) ?? "Error"), 0, 0);
  }
  const details = coerceDetails(result.details);
  if (!details) {
    return new Text(firstTextBlock(result.content) ?? "", 0, 0);
  }
  if (details.terminalState === "skipped") {
    return new Text(
      `${theme.fg("dim", "Skipped")}\n${formatSubmittedSummary(details, theme)}`,
      0,
      0,
    );
  }
  if (details.terminalState === "cancelled") {
    return new Text(theme.fg("warning", "Cancelled"), 0, 0);
  }
  if (details.terminalState === "aborted") {
    return new Text(theme.fg("error", "Aborted"), 0, 0);
  }
  return new Text(formatSubmittedSummary(details, theme), 0, 0);
}

function firstTextBlock(content: AgentToolResult<AskUserDetails>["content"]): string | undefined {
  return content.find((block) => block.type === "text")?.text;
}

function isErrorDetails(details: unknown): boolean {
  return (
    !!details &&
    typeof details === "object" &&
    (details as Record<string, unknown>)[ASK_USER_ERROR_MARKER] === true
  );
}

function extractHeadersFromArgs(args: AskUserParams): string[] {
  return args.questions.map((question) => question.header).filter((header) => header.length > 0);
}

function coerceDetails(details: unknown): AskUserDetails | null {
  if (!details || typeof details !== "object") return null;
  const obj = details as { terminalState?: unknown; questions?: unknown; answers?: unknown };
  if (typeof obj.terminalState !== "string") return null;
  if (!Array.isArray(obj.questions) || !Array.isArray(obj.answers)) return null;
  return obj as AskUserDetails;
}

function formatSubmittedSummary(details: AskUserDetails, theme: Theme): string {
  const byId = new Map(details.answers.map((answer) => [answer.questionId, answer]));
  return details.questions
    .map((question) => formatLine(question, byId.get(question.id), theme))
    .join("\n");
}

function formatLine(
  question: NormalizedQuestion,
  answer: AskUserDetails["answers"][number] | undefined,
  theme: Theme,
): string {
  if (!answer) {
    return `${theme.fg("warning", "○ ")}${theme.fg("muted", question.header)}: (no answer)`;
  }
  return `${theme.fg("success", "✓ ")}${theme.fg("accent", question.header)}: ${theme.fg("text", formatSummaryBody(question, answer))}`;
}
