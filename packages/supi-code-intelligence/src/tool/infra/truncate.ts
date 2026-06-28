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
