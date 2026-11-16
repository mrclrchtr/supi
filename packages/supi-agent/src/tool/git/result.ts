import { type AgentToolResult, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import type { GitQueryOutput } from "./execute.ts";

/** Empty stdout from a successful query: nothing matched, not a failure. */
export const EMPTY_OUTPUT_TEXT =
  "(no output: Git found no differences, matching commits, or matching files for these arguments)";

/** Assemble the model-visible Git result under PI's standard output limits. */
export function buildGitResult(
  args: readonly string[],
  output: GitQueryOutput,
): AgentToolResult<unknown> {
  const truncation = truncateHead(output.stdout);
  const truncated = truncation.truncated || output.capped;
  let text = truncation.content || EMPTY_OUTPUT_TEXT;
  if (truncated) {
    const total = output.capped
      ? `more than ${formatSize(Buffer.byteLength(output.stdout))}`
      : `${truncation.totalLines} lines, ${formatSize(truncation.totalBytes)}`;
    text += `\n\n[Output truncated to ${truncation.outputLines} lines of ${total}. Narrow with paths after --, --stat, --name-only, or -n.]`;
  }
  return {
    content: [{ type: "text", text }],
    details: { args: [...args], truncated },
  };
}
