/** Shared transcript render helpers for paged review tool output. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { ReviewOutputReference } from "../types.ts";

export interface TextResult {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
}

export function body(result: TextResult): string {
  const content = result.content?.[0];
  return content?.type === "text" ? (content.text ?? "") : "";
}

export function pageSummary(label: string, details: ReviewOutputReference, theme: Theme): string {
  const end = details.nextOffset ?? details.totalCharacters;
  const continuation = details.nextOffset === undefined ? "complete" : "more available";
  return `${theme.fg("accent", label)} ${theme.fg("muted", `${details.offset.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${details.totalCharacters.toLocaleString("en-US")} chars`)} ${theme.fg("dim", `· ${continuation}`)}`;
}

export function expandedPage(
  label: string,
  details: ReviewOutputReference,
  result: TextResult,
  theme: Theme,
): Container {
  const container = new Container();
  container.addChild(new Text(pageSummary(label, details, theme), 0, 0));
  const text = body(result).trimEnd();
  if (text) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("toolOutput", text), 0, 0));
  }
  return container;
}
