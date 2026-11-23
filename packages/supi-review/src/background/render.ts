import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { renderRunResult } from "../tool/review_run/render.ts";

const firstText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const part = content.find((entry) => entry?.type === "text");
  return typeof part?.text === "string" ? part.text : "";
};

/**
 * Render a Background Review `agent_result`: the Review report once complete, else the status line
 * that leads a partial report or a `wait` progress update.
 */
export function renderReviewCollection(
  result: AgentToolResult<unknown>,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
) {
  const details = result.details as { complete?: unknown } | undefined;
  if (details?.complete === true) return renderRunResult(result, options, theme);
  return new Text(theme.fg("dim", firstText(result.content).split("\n", 1)[0] ?? ""), 0, 0);
}

/** Render a Background Review `agent_cancel` result or Completion Notice as its plain text. */
export function renderReviewText(
  message: { content?: unknown },
  _options: { expanded: boolean },
  theme: Theme,
): Text {
  return new Text(theme.fg("dim", firstText(message.content)), 0, 0);
}
