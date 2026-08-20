import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import type { ModelVisibleOutput } from "../result.ts";
import type { WebFetchOutputMode } from "./spec.ts";

export interface WebFetchDetails extends Record<string, unknown> {
  chars: number;
  lines: number;
  url: string;
  outputMode: WebFetchOutputMode;
  filePath?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

/** Common result metrics shared by both fetch result modes. */
export interface WebFetchResultBase {
  chars: number;
  lines: number;
  url: string;
  outputMode: WebFetchOutputMode;
}

/** Assemble the file-mode result for one fetch. */
export function buildFileResult(
  base: WebFetchResultBase,
  filePath: string,
): AgentToolResult<WebFetchDetails> {
  return {
    content: [
      {
        type: "text",
        text: `Content written to ${filePath} (${base.chars.toLocaleString()} chars, ${base.lines.toLocaleString()} lines). Use the read tool to access it.`,
      },
    ],
    details: { ...base, filePath },
  };
}

/** Assemble the inline-mode result for one fetch. */
export function buildInlineResult(
  base: WebFetchResultBase,
  output: ModelVisibleOutput,
): AgentToolResult<WebFetchDetails> {
  return {
    content: [{ type: "text", text: output.text }],
    details: {
      ...base,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}
