import { type AgentToolResult, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import type { GitQueryOutput } from "./execute.ts";

/** Git fails on an unknown revision but prints nothing for a path that matches no file. */
const RESOLVED_NOTE =
  "Every revision resolved, since an unknown one is an error; paths are not checked for existence.";

const EMPTY_REASONS: Readonly<Record<string, string>> = {
  diff: `no differences. ${RESOLVED_NOTE}`,
  log: `no commits matched. ${RESOLVED_NOTE}`,
  "ls-files": "no tracked files matched. Untracked files appear in status.",
  status: "nothing to report; the working tree is clean for these arguments.",
};

/** Text for empty stdout from a successful query: nothing matched, not a failure. */
export function emptyOutputText(subcommand: string | undefined): string {
  const reason = EMPTY_REASONS[subcommand ?? ""] ?? "Git printed nothing for these arguments.";
  return `(no output: ${reason})`;
}

/** Assemble the model-visible Git result under PI's standard output limits. */
export function buildGitResult(
  args: readonly string[],
  output: GitQueryOutput,
): AgentToolResult<unknown> {
  const truncation = truncateHead(output.stdout);
  const truncated = truncation.truncated || output.capped;
  let text = truncation.content || emptyOutputText(args[0]);
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
