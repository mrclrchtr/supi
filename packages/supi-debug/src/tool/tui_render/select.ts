/**
 * Select one stored tool result, with its call arguments, from a session branch.
 *
 * Works on the generic entry shape so it stays independent of Pi's session types.
 */

/** Which stored result to render: by tool name and recency, or by exact tool call id. */
export type ToolResultSelector =
  | { tool: { name: string; index?: number }; toolCallId?: undefined }
  | { toolCallId: string; tool?: undefined };

/** Stored result fields the TUI passes to a result renderer. */
export interface StoredToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  details?: unknown;
}

/** A stored tool result, its call arguments, and where it sits among results of its tool. */
export interface SelectedToolResult {
  kind: "selected";
  toolName: string;
  toolCallId: string;
  /** Position counted back from the latest matching result; 0 for `toolCallId` selection. */
  index: number;
  /** Matching results on the branch; 1 for `toolCallId` selection. */
  matchCount: number;
  /** Call arguments, or `{}` when the call is not on the branch. */
  args: Record<string, unknown>;
  result: StoredToolResult;
  isError: boolean;
  durationMs?: number;
}

/** Selection outcome; `not-found` carries a message for the model. */
export type ToolResultSelection = SelectedToolResult | { kind: "not-found"; message: string };

interface ToolResultRecord {
  toolCallId: string;
  toolName: string;
  content: StoredToolResult["content"];
  details?: unknown;
  isError: boolean;
  durationMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function messageOf(entry: unknown): Record<string, unknown> | undefined {
  const record = asRecord(entry);
  return record?.type === "message" ? asRecord(record.message) : undefined;
}

function readToolResult(message: Record<string, unknown>): ToolResultRecord | undefined {
  if (message.role !== "toolResult") return undefined;
  if (typeof message.toolCallId !== "string" || typeof message.toolName !== "string") {
    return undefined;
  }
  return {
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: Array.isArray(message.content) ? (message.content as StoredToolResult["content"]) : [],
    details: message.details,
    isError: message.isError === true,
    durationMs: typeof message.durationMs === "number" ? message.durationMs : undefined,
  };
}

function collectBranch(entries: readonly unknown[]) {
  const results: ToolResultRecord[] = [];
  const callArgs = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const message = messageOf(entry);
    if (!message) continue;
    const toolResult = readToolResult(message);
    if (toolResult) {
      results.push(toolResult);
      continue;
    }
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const block = asRecord(part);
      if (block?.type === "toolCall" && typeof block.id === "string") {
        callArgs.set(block.id, asRecord(block.arguments) ?? {});
      }
    }
  }
  return { results, callArgs };
}

function describeBranchTools(results: readonly ToolResultRecord[]): string {
  if (results.length === 0) return "The current session branch has no tool results.";
  const counts = new Map<string, number>();
  for (const result of results) counts.set(result.toolName, (counts.get(result.toolName) ?? 0) + 1);
  const listed = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name} (${count})`);
  return `Tool results on this branch: ${listed.join(", ")}.`;
}

/**
 * Select a tool result from session branch entries (oldest first, as returned by
 * `sessionManager.getBranch()`). `index` counts back from the latest match.
 */
export function selectToolResult(
  entries: readonly unknown[],
  selector: ToolResultSelector,
): ToolResultSelection {
  const { results, callArgs } = collectBranch(entries);

  let chosen: ToolResultRecord | undefined;
  let index = 0;
  let matchCount = 1;
  if (selector.toolCallId !== undefined) {
    chosen = results.find((result) => result.toolCallId === selector.toolCallId);
    if (!chosen) {
      return {
        kind: "not-found",
        message: `No tool result with toolCallId "${selector.toolCallId}" on the current session branch.`,
      };
    }
  } else {
    const { name } = selector.tool;
    index = selector.tool.index ?? 0;
    const matches = results.filter((result) => result.toolName === name);
    matchCount = matches.length;
    if (matchCount === 0) {
      return {
        kind: "not-found",
        message: `No "${name}" result on the current session branch. ${describeBranchTools(results)}`,
      };
    }
    chosen = matches[matchCount - 1 - index];
    if (!chosen) {
      return {
        kind: "not-found",
        message: `Index ${index} is out of range: the current session branch has ${matchCount} "${name}" result${matchCount === 1 ? "" : "s"} (index 0 is the latest).`,
      };
    }
  }

  return {
    kind: "selected",
    toolName: chosen.toolName,
    toolCallId: chosen.toolCallId,
    index,
    matchCount,
    args: callArgs.get(chosen.toolCallId) ?? {},
    result: { content: chosen.content, details: chosen.details },
    isError: chosen.isError,
    ...(chosen.durationMs === undefined ? {} : { durationMs: chosen.durationMs }),
  };
}
