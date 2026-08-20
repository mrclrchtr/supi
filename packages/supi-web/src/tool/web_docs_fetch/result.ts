import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import type { ModelVisibleOutput } from "../result.ts";

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
  raw: boolean,
  textContent: string,
  output: ModelVisibleOutput,
): AgentToolResult<FetchDetails> {
  return {
    content: [{ type: "text", text: output.text }],
    details: {
      libraryId,
      raw,
      chars: textContent.length,
      lines: textContent.split("\n").length,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}
