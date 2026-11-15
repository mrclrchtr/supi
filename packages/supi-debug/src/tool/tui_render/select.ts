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

/** A call another tool made (for example from codemode); Pi stores no result for it. */
interface NestedCallRecord {
  id: string;
  name: string;
  parent: { toolCallId: string; toolName: string };
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

function readNestedCalls(message: Record<string, unknown>, parent: ToolResultRecord) {
  const calls = asRecord(message.nestedCalls)?.calls;
  if (!Array.isArray(calls)) return [];
  const nested: NestedCallRecord[] = [];
  for (const call of calls) {
    const record = asRecord(call);
    if (typeof record?.id !== "string" || typeof record.name !== "string") continue;
    nested.push({
      id: record.id,
      name: record.name,
      parent: { toolCallId: parent.toolCallId, toolName: parent.toolName },
    });
  }
  return nested;
}

function collectBranch(entries: readonly unknown[]) {
  const results: ToolResultRecord[] = [];
  const nested: NestedCallRecord[] = [];
  const callArgs = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const message = messageOf(entry);
    if (!message) continue;
    const toolResult = readToolResult(message);
    if (toolResult) {
      results.push(toolResult);
      nested.push(...readNestedCalls(message, toolResult));
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
  return { results, nested, callArgs };
}

const NESTED_HINT = "Pi stores no results for nested calls; render the parent row instead";

function parentTarget(call: NestedCallRecord): string {
  return `target { toolCallId: "${call.parent.toolCallId}" } (${call.parent.toolName})`;
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

type Branch = ReturnType<typeof collectBranch>;
type Located =
  | { kind: "found"; record: ToolResultRecord; index: number; matchCount: number }
  | { kind: "not-found"; message: string };

function notFound(message: string): Located {
  return { kind: "not-found", message };
}

function locateByCallId(branch: Branch, toolCallId: string): Located {
  const record = branch.results.find((result) => result.toolCallId === toolCallId);
  if (record) return { kind: "found", record, index: 0, matchCount: 1 };
  const call = branch.nested.find((candidate) => candidate.id === toolCallId);
  return notFound(
    call
      ? `"${call.id}" is a nested ${call.name} call. ${NESTED_HINT}: ${parentTarget(call)}.`
      : `No tool result with toolCallId "${toolCallId}" on the current session branch.`,
  );
}

function locateByTool(branch: Branch, name: string, index: number): Located {
  const matches = branch.results.filter((result) => result.toolName === name);
  const matchCount = matches.length;
  if (matchCount === 0) {
    const calls = branch.nested.filter((call) => call.name === name);
    const latest = calls.at(-1);
    const times = calls.length === 1 ? "once" : `${calls.length} times`;
    const tools = describeBranchTools(branch.results);
    return notFound(
      latest
        ? `"${name}" ran ${times} only inside other tools. ${NESTED_HINT}: ${parentTarget(latest)}. ${tools}`
        : `No "${name}" result on the current session branch. ${tools}`,
    );
  }
  const record = matches[matchCount - 1 - index];
  if (record) return { kind: "found", record, index, matchCount };
  return notFound(
    `Index ${index} is out of range: the current session branch has ${matchCount} "${name}" result${matchCount === 1 ? "" : "s"} (index 0 is the latest).`,
  );
}

/**
 * Select a tool result from session branch entries (oldest first, as returned by
 * `sessionManager.getBranch()`). `index` counts back from the latest match. Calls that ran
 * only inside another tool have no stored result; the message names their parent row.
 */
export function selectToolResult(
  entries: readonly unknown[],
  selector: ToolResultSelector,
): ToolResultSelection {
  const branch = collectBranch(entries);
  const located =
    selector.toolCallId !== undefined
      ? locateByCallId(branch, selector.toolCallId)
      : locateByTool(branch, selector.tool.name, selector.tool.index ?? 0);
  if (located.kind === "not-found") return located;

  const { record, index, matchCount } = located;
  return {
    kind: "selected",
    toolName: record.toolName,
    toolCallId: record.toolCallId,
    index,
    matchCount,
    args: branch.callArgs.get(record.toolCallId) ?? {},
    result: { content: record.content, details: record.details },
    isError: record.isError,
    ...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
  };
}
