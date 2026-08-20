import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { modelFacingPage, type TextPage } from "../output-page.ts";
import { REVIEW_OUTPUT_TOOL_NAME } from "./spec.ts";

export interface ReviewOutputPageDetails {
  kind: "review-output-page";
  artifactId: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
}

/** Assemble the model-facing page result for a stored Review output artifact. */
export function buildOutputPageResult(
  artifactId: string,
  page: TextPage,
): AgentToolResult<ReviewOutputPageDetails> {
  return {
    content: [
      {
        type: "text",
        text: modelFacingPage(REVIEW_OUTPUT_TOOL_NAME, { artifactId }, page),
      },
    ],
    details: {
      kind: "review-output-page",
      artifactId,
      offset: page.offset,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      totalCharacters: page.totalCharacters,
    },
  };
}
