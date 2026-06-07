import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { extractAssistantText } from "../tool/runner-helpers.ts";

type ResolvedSessionMessage = SessionContext["messages"][number];

const DEFAULT_MAX_CHARS = 8_000;

export interface SerializeSessionContextOptions {
  maxChars?: number;
}

/**
 * Serialize the resolved LLM-visible session context into a compaction-style
 * readable transcript for the brief synthesizer.
 *
 * This mirrors the overall approach Pi uses for compaction:
 * - messages are labeled by role and rendered in chronological order
 * - compaction and branch summaries appear with their own labels
 * - the output is bounded so the synthesizer stays predictable on long sessions
 * - no heuristic ranking or scoring is applied
 */
export function serializeSessionContext(
  messages: ResolvedSessionMessage[],
  options?: SerializeSessionContextOptions,
): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  if (messages.length === 0) return "";

  const entries = messages
    .map((message) => serializeEntry(message))
    .filter(
      (entry): entry is { label: string; text: string; isSummary: boolean } => entry !== undefined,
    );

  if (entries.length === 0) return "";

  // Separate summary entries (compaction/branch summaries) from regular entries
  const summaryEntries = entries.filter((e) => e.isSummary);
  const regularEntries = entries.filter((e) => !e.isSummary);

  // Estimate the total size if we keep everything
  const allLines = entries.map(formatEntry);
  const totalSize = measureLines(allLines);

  if (totalSize <= maxChars) {
    return allLines.join("\n");
  }

  // Build the output: always include summaries, then as many recent regular entries as fit
  const summaryLines = summaryEntries.map(formatEntry);

  // Walk regular entries from newest to oldest, keeping as many as fit
  const keptRegular: typeof regularEntries = [];
  let size = measureLines(summaryLines);

  for (let i = regularEntries.length - 1; i >= 0; i--) {
    const line = formatEntry(regularEntries[i]);
    const lineLen = line.length + 1; // +1 for newline
    if (keptRegular.length > 0 && size + lineLen > maxChars) {
      break;
    }
    keptRegular.unshift(regularEntries[i]);
    size += lineLen;
  }

  // Build final output: summaries first, then kept recent entries
  const keptLines = [...summaryLines, ...keptRegular.map(formatEntry)];

  // If still nothing fits with summaries alone, truncate the summaries
  if (keptLines.length > 0) {
    const output = keptLines.join("\n");
    if (output.length <= maxChars) return output;
  }

  // Last resort: truncate the full output
  return keepFirstLines(keptLines, maxChars);
}

function formatEntry(entry: { label: string; text: string }): string {
  return `[${entry.label}]\n${entry.text}`;
}

function measureLines(lines: string[]): number {
  return lines.reduce((acc, line) => acc + line.length + 1, 0); // +1 for newline
}

function keepFirstLines(lines: string[], maxChars: number): string {
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    const lineLen = line.length + 1;
    if (size + lineLen > maxChars) break;
    kept.push(line);
    size += lineLen;
  }
  return kept.join("\n");
}

function serializeEntry(
  message: ResolvedSessionMessage,
): { label: string; text: string; isSummary: boolean } | undefined {
  switch (message.role) {
    case "user":
    case "assistant": {
      const text = normalizeText(extractAssistantText(message.content) ?? "");
      if (!text) return undefined;
      return {
        label: message.role === "user" ? "User" : "Assistant",
        text,
        isSummary: false,
      };
    }
    case "custom": {
      const text = normalizeText(extractAssistantText(message.content) ?? "");
      if (!text) return undefined;
      return { label: "Custom", text, isSummary: false };
    }
    case "compactionSummary": {
      const text = normalizeText(message.summary);
      if (!text) return undefined;
      return { label: "Compaction summary", text, isSummary: true };
    }
    case "branchSummary": {
      const text = normalizeText(message.summary);
      if (!text) return undefined;
      return { label: "Branch summary", text, isSummary: true };
    }
    default:
      return undefined;
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
