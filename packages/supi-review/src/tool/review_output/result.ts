import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { modelFacingPage, type TextPage } from "../output-page.ts";
import { REVIEW_OUTPUT_TOOL_NAME, type reviewOutputSpec } from "./spec.ts";

export interface ReviewOutputPageDetails {
  kind: "review-output-page";
  artifactId: string;
  offset: number;
  nextOffset?: number;
  totalCharacters: number;
}

/** Assemble a readable page and complete native text without changing the UI/state contract. */
export function buildOutputPageResult(
  artifactId: string,
  text: string,
  page: TextPage,
): AgentToolResult<ReviewOutputPageDetails> & {
  structuredContent: Static<typeof reviewOutputSpec.outputSchema>;
} {
  return {
    content: [
      {
        type: "text",
        text: modelFacingPage(REVIEW_OUTPUT_TOOL_NAME, { artifactId }, page),
      },
    ],
    structuredContent: { artifactId, text, totalCharacters: page.totalCharacters },
    details: {
      kind: "review-output-page",
      artifactId,
      offset: page.offset,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      totalCharacters: page.totalCharacters,
    },
  };
}
