import type { AgentToolResult, TruncationResult } from "@earendil-works/pi-coding-agent";
import { type ModelVisibleOutput, modelOutputMetadata } from "../result.ts";
import type { WebFetchOutputMode } from "./input.ts";
import type { WebFetchMdOutput } from "./result-schema.ts";

/** Final fetch result requires both native representations. */
export type WebFetchResult = AgentToolResult<WebFetchDetails> & {
  structuredContent: WebFetchMdOutput;
};

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
export function buildFileResult(base: WebFetchResultBase, filePath: string): WebFetchResult {
  return {
    content: [
      {
        type: "text",
        text: `Content written to ${filePath} (${base.chars.toLocaleString()} chars, ${base.lines.toLocaleString()} lines). Use the read tool to access it.`,
      },
    ],
    structuredContent: {
      mode: "file",
      url: base.url,
      chars: base.chars,
      lines: base.lines,
      filePath,
    },
    details: { ...base, filePath },
  };
}

/** Assemble the inline-mode result for one fetch. */
export function buildInlineResult(
  base: WebFetchResultBase,
  markdown: string,
  output: ModelVisibleOutput,
): WebFetchResult {
  return {
    content: [{ type: "text", text: output.text }],
    structuredContent: {
      mode: "inline",
      url: base.url,
      chars: base.chars,
      lines: base.lines,
      markdown,
      modelOutput: modelOutputMetadata(output),
    },
    details: {
      ...base,
      truncation: output.truncation,
      fullOutputPath: output.fullOutputPath,
    },
  };
}
