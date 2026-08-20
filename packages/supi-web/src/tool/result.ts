import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { writeTempFile } from "../temp-file.ts";

/** Human-readable truncation contract shared by all model-visible web outputs. */
export const MODEL_OUTPUT_LIMIT_DESCRIPTION = `Inline truncates at ${DEFAULT_MAX_LINES.toLocaleString()} lines/${formatSize(DEFAULT_MAX_BYTES)}; full saved to temp.`;

/** Result of preparing content for a tool response visible to the model. */
export interface ModelVisibleOutput {
  /** Text safe to return in a tool result. */
  text: string;
  /** Truncation metadata when truncation happened. */
  truncation?: TruncationResult;
  /** Temp file containing the full, untruncated output when truncation happened. */
  fullOutputPath?: string;
}

/** Prepare content for model-visible output, preserving full output in a temp file if truncated. */
export async function limitModelVisibleOutput(
  content: string,
  options: { tempPrefix: string; suffix: string },
): Promise<ModelVisibleOutput> {
  const truncation = truncateHead(content, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) {
    return { text: content };
  }

  const fullOutputPath = await writeTempFile(content, options.tempPrefix, options.suffix);
  const prefix = truncation.content.length > 0 ? `${truncation.content}\n\n` : "";
  const notice = [
    `[Output truncated: ${truncation.outputLines.toLocaleString()}/${truncation.totalLines.toLocaleString()} lines,`,
    `${formatSize(truncation.outputBytes)}/${formatSize(truncation.totalBytes)}.`,
    `Full: ${fullOutputPath}]`,
  ].join(" ");

  return {
    text: `${prefix}${notice}`,
    truncation,
    fullOutputPath,
  };
}
