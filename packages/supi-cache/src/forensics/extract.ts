// Session extraction utilities — pull cache turns and tool windows from branches.

import { readFile } from "node:fs/promises";
import type { FileEntry, SessionEntry } from "@mariozechner/pi-coding-agent";
import { migrateSessionEntries, parseSessionEntries } from "@mariozechner/pi-coding-agent";
import type { TurnRecord } from "../monitor/state.ts";
import { computeToolCallShape } from "./redact.ts";
import type { ToolCallShape } from "./types.ts";

/**
 * Read and parse a PI session file into FileEntry[].
 *
 * Calls migrateSessionEntries to handle legacy v1/v2 files.
 */
export async function parseSessionFile(path: string): Promise<FileEntry[]> {
  const content = await readFile(path, { encoding: "utf-8" });
  const entries = parseSessionEntries(content);
  migrateSessionEntries(entries);
  return entries;
}

/**
 * Filter a session branch for `supi-cache-turn` custom entries and return
 * the parsed TurnRecord objects.
 *
 * Sessions without any cache turns return an empty array.
 */
export function extractCacheTurnEntries(branch: SessionEntry[]): TurnRecord[] {
  const turns: TurnRecord[] = [];
  for (const entry of branch) {
    if (entry.type === "custom" && entry.customType === "supi-cache-turn") {
      const data = entry.data as TurnRecord | undefined;
      if (data) {
        turns.push(data);
      }
    }
  }
  return turns;
}

/**
 * Extract tool-call shape fingerprints aligned by cache-turn timestamps.
 *
 * Returns a Map from **turnIndex** to the tool calls that occurred between
 * `turn[i-lookback].timestamp` (inclusive) and `turn[i].timestamp` (exclusive).
 *
 * Uses turn timestamps rather than message count so that assistant messages
 * without cache-turn entries (no usage reported) don't skew the window.
 */
export function extractToolCallWindows(
  branch: SessionEntry[],
  lookback: number = 2,
): Map<number, ToolCallShape[]> {
  // First pass: collect all assistant messages with epoch timestamps and tools.
  const assistantMessages: { timestampEpoch: number; tools: ToolCallShape[] }[] = [];
  for (const entry of branch) {
    if (entry.type === "message") {
      const msg = entry.message as unknown as Record<string, unknown>;
      if (msg.role === "assistant") {
        assistantMessages.push({
          timestampEpoch: new Date(entry.timestamp).getTime(),
          tools: extractToolCallsFromMessage(msg),
        });
      }
    }
  }

  // Collect cache turns with their turn-index and recorded timestamp.
  const turns = extractCacheTurnEntries(branch);

  // For each turn, find assistant messages in the preceding-turns window.
  const result = new Map<number, ToolCallShape[]>();
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const startIdx = Math.max(0, i - lookback);
    const windowStart = turns[startIdx].timestamp;
    const windowEnd = turn.timestamp;

    const prevTools: ToolCallShape[] = [];
    for (const msg of assistantMessages) {
      if (msg.timestampEpoch >= windowStart && msg.timestampEpoch < windowEnd) {
        prevTools.push(...msg.tools);
      }
    }
    result.set(turn.turnIndex, prevTools);
  }

  return result;
}

function extractToolCallsFromMessage(msg: Record<string, unknown>): ToolCallShape[] {
  const content = msg.content;
  if (!Array.isArray(content)) return [];

  const shapes: ToolCallShape[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as Record<string, unknown>).type === "toolCall" &&
      "name" in block
    ) {
      const toolName = String((block as Record<string, unknown>).name);
      const args = (block as Record<string, unknown>).arguments as
        | Record<string, unknown>
        | undefined;
      if (args && typeof args === "object") {
        shapes.push(computeToolCallShape(toolName, args));
      }
    }
  }
  return shapes;
}

/**
 * Find the most recent comparable turn (one with a defined hitRate)
 * before the given index.
 */
export function findPreviousComparableTurn(
  turns: TurnRecord[],
  index: number,
): TurnRecord | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (turns[i].hitRate !== undefined) {
      return turns[i];
    }
  }
  return undefined;
}
