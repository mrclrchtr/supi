// Custom renderCall / renderResult for the `ask_user` tool. Keeps the in-line
// session transcript readable: a one-line "asking N questions: …" header on
// the call, and a compact ✓ / cancelled / aborted summary on the result.

import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { formatSummaryBody } from "./format.ts";
import { ASK_USER_ERROR_MARKER } from "./result.ts";
import type { AskUserDetails, NormalizedQuestion } from "./types.ts";

const MAX_HEADER_LIST = 60;

export function renderAskUserCall(args: unknown, theme: Theme): Text {
  const headers = extractHeadersFromArgs(args);
  const count = headers.length;
  let text = theme.fg("toolTitle", theme.bold("ask_user "));
  text += theme.fg("muted", `${count || "?"} question${count === 1 ? "" : "s"}`);
  if (count > 0) {
    text += theme.fg("dim", ` (${truncateToWidth(headers.join(", "), MAX_HEADER_LIST)})`);
  }
  return new Text(text, 0, 0);
}

export function renderAskUserResult(
  result: { details?: unknown; content: { type: string; text?: string }[] },
  theme: Theme,
): Text {
  if (isErrorDetails(result.details)) {
    const text = result.content[0]?.text ?? "Error";
    return new Text(theme.fg("error", text), 0, 0);
  }
  const details = coerceDetails(result.details);
  if (!details) {
    const fallback = result.content[0];
    return new Text(fallback?.type === "text" ? (fallback.text ?? "") : "", 0, 0);
  }
  if (details.terminalState === "cancelled") {
    return new Text(theme.fg("warning", "Cancelled"), 0, 0);
  }
  if (details.terminalState === "aborted") {
    return new Text(theme.fg("error", "Aborted"), 0, 0);
  }
  return new Text(formatSubmittedSummary(details, theme), 0, 0);
}

function isErrorDetails(details: unknown): boolean {
  return (
    !!details &&
    typeof details === "object" &&
    (details as Record<string, unknown>)[ASK_USER_ERROR_MARKER] === true
  );
}

function extractHeadersFromArgs(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const questions = (args as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .map((q) => (q && typeof q === "object" ? (q as { header?: unknown }).header : undefined))
    .filter((h): h is string => typeof h === "string" && h.length > 0);
}

function coerceDetails(details: unknown): AskUserDetails | null {
  if (!details || typeof details !== "object") return null;
  const obj = details as { terminalState?: unknown; questions?: unknown; answers?: unknown };
  if (typeof obj.terminalState !== "string") return null;
  if (!Array.isArray(obj.questions) || !Array.isArray(obj.answers)) return null;
  return obj as unknown as AskUserDetails;
}

function formatSubmittedSummary(details: AskUserDetails, theme: Theme): string {
  const byId = new Map(details.answers.map((a) => [a.questionId, a]));
  const lines = details.questions.map((q) => formatLine(q, byId.get(q.id), theme));
  return lines.join("\n");
}

function formatLine(
  q: NormalizedQuestion,
  answer: AskUserDetails["answers"][number] | undefined,
  theme: Theme,
): string {
  if (!answer) {
    return `${theme.fg("warning", "○ ")}${theme.fg("muted", q.header)}: (no answer)`;
  }
  const body = formatSummaryBody(q, answer);
  const decorated = `${theme.fg("success", "✓ ")}${theme.fg("accent", q.header)}: ${theme.fg("text", body)}`;
  if (answer.comment) {
    return `${decorated} ${theme.fg("dim", `— ${answer.comment}`)}`;
  }
  return decorated;
}
