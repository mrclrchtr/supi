import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import type { DocSnippet } from "../../context7-client.ts";
import { type ModelVisibleOutput, modelOutputMetadata } from "../result.ts";
import type { WebDocsFetchOutput } from "./result-schema.ts";

/** Final documentation result preserves the API payload for programmatic callers. */
export type FetchResult = AgentToolResult<FetchDetails> & {
  structuredContent: WebDocsFetchOutput;
};

export interface FetchDetails extends Record<string, unknown> {
  libraryId: string;
  raw: boolean;
  chars: number;
  lines: number;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

/** Assemble the model-facing result for one docs fetch. */
export function buildFetchResult(
  libraryId: string,
  payload: { raw: boolean; content: string | DocSnippet[]; textContent: string },
  output: ModelVisibleOutput,
): FetchResult {
  const { raw, content, textContent } = payload;
  const chars = textContent.length;
  const lines = textContent.split("\n").length;
  const context = { libraryId, chars, lines, modelOutput: modelOutputMetadata(output) };
  return {
    content: [{ type: "text", text: output.text }],
    structuredContent:
      typeof content === "string"
        ? { ...context, format: "markdown", markdown: content }
        : {
            ...context,
            format: "snippets",
            snippets: content.map(({ title, content: body, source }) => ({
              title,
              content: body,
              source,
            })),
          },
    details: {
      libraryId,
      raw,
      chars,
      lines,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}
