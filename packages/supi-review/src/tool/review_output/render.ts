/** Transcript renderers for the review_output tool. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { renderError, renderPartial, renderReviewToolCall } from "../../tui/common.ts";
import type { ReviewOutputReference } from "../../types.ts";
import { expandedPage, pageSummary, type TextResult } from "../page-render.ts";
import { REVIEW_OUTPUT_TOOL_NAME } from "./spec.ts";

interface PageDetails extends ReviewOutputReference {
  kind: "review-output-page";
}

export function renderOutputCall(args: unknown, theme: Theme): Text {
  const params = (args ?? {}) as { artifactId?: string; offset?: number };
  return renderReviewToolCall(
    REVIEW_OUTPUT_TOOL_NAME,
    params.artifactId ?? "output",
    theme,
    `offset ${params.offset ?? 0}`,
  );
}

export function renderOutputResult(
  result: TextResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError: boolean } = { isError: false },
) {
  if (options.isPartial) return renderPartial("Reading review output…", theme);
  const details = result.details as PageDetails | undefined;
  if (context.isError || details?.kind !== "review-output-page") {
    return renderError(`${REVIEW_OUTPUT_TOOL_NAME} failed`, theme);
  }
  if (options.expanded) return expandedPage("Review output", details, result, theme);
  return new Text(pageSummary("Review output", details, theme), 0, 0);
}
