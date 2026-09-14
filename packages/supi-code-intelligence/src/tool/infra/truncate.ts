import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

/** Options for {@link truncateToolContent}. */
export interface TruncateToolContentOptions {
  /** Max lines (defaults to pi's {@link DEFAULT_MAX_LINES}). */
  maxLines?: number;
  /** Max bytes (defaults to pi's {@link DEFAULT_MAX_BYTES}). */
  maxBytes?: number;
}

/** Result of truncating a tool's model-facing content. */
export interface TruncatedToolContent {
  /** Content, with a `[truncated: ...]` notice appended when truncation occurred. */
  text: string;
  /** Whether truncation occurred. */
  truncated: boolean;
}

/**
 * Head-truncate model-facing tool content to pi defaults and append a
 * `[truncated: kept N of M lines (X of Y)]` notice when truncation occurs.
 *
 * Used by the code-intelligence tool adapter so every tool emits uniformly
 * bounded output regardless of which executor produced it. Short content is
 * returned unchanged (`truncated: false`, no notice). `details` are never
 * truncated — only the markdown `content` string passes through here.
 *
 * Head truncation (not tail) is correct for code-intelligence output: results
 * are ranked/structured and the most relevant entries come first.
 */
export function truncateToolContent(
  content: string,
  options: TruncateToolContentOptions = {},
): TruncatedToolContent {
  const result = truncateHead(content, {
    maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  if (!result.truncated) {
    return { text: content, truncated: false };
  }
  const notice = `\n[truncated: kept ${result.outputLines} of ${result.totalLines} lines (${formatSize(result.outputBytes)} of ${formatSize(result.totalBytes)})]\n`;
  return { text: `${result.content}${notice}`, truncated: true };
}

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeIntelResult } from "../../types/index.ts";
import type { ToolOutputTruncationDetails } from "../result/types.ts";

/**
 * Apply the canonical output bound to one assembled code-tool result:
 * truncate at PI limits, spill the full content to a temp file when it
 * overflowed or the human display omits returned evidence. A display-only
 * continuation does not add text to model content. File failure is fatal only
 * when model content would otherwise be lost.
 */
export function boundCodeToolResult(
  content: string,
  details: CodeIntelResult["details"],
  options: { toolName: string; maxLines?: number; maxBytes?: number },
): { content: Array<{ type: "text"; text: string }>; details: CodeIntelResult["details"] } {
  const withTruncation = (truncation: ToolOutputTruncationDetails) =>
    details ? { ...details, truncation } : details;

  const { text, truncated } = truncateToolContent(content, {
    maxLines: options.maxLines,
    maxBytes: options.maxBytes,
  });
  const displayTruncated = details?.truncation?.displayTruncated === true;
  const truncation = { truncated, ...(displayTruncated ? { displayTruncated } : {}) };
  if ((truncated || displayTruncated) && content.length > 0) {
    try {
      const spillPath = saveFullContent(content, options.toolName);
      return {
        content: [
          {
            type: "text" as const,
            text: truncated ? `${text}\n_Full output saved to: \`${spillPath}\`_` : text,
          },
        ],
        details: withTruncation({ ...truncation, fullOutputPath: spillPath }),
      };
    } catch (error) {
      if (truncated) throw error;
      // Keep valid evidence when only its optional human continuation failed.
    }
  }
  return {
    content: [{ type: "text" as const, text }],
    details: withTruncation(truncation),
  };
}

function saveFullContent(content: string, toolName: string): string {
  const dir = mkdtempSync(join(tmpdir(), "supi-ci-"));
  const spillPath = join(dir, `${toolName}-output.md`);
  try {
    writeFileSync(spillPath, content, "utf-8");
    return spillPath;
  } catch (error) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Preserve the write error. */
    }
    throw error;
  }
}
