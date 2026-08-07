import type { AgentRunMessage } from "@mrclrchtr/supi-agent-runtime/api";
import { MAX_CONVERSATION_ENTRIES, MAX_CONVERSATION_TEXT_CHARS } from "./bounds.ts";
import { summarizeToolCall } from "./tool-summary.ts";

// ── Domain types ─────────────────────────────────────────────────

/** One visible entry in a bounded Agent Conversation View. */
export type ConversationEntry =
  | { kind: "assistant"; text: string }
  | { kind: "steering"; text: string }
  | { kind: "tool"; toolName: string; status: "completed" | "error" | "unknown"; summary?: string };

/** Task metadata displayed separately from the conversation stream. */
export interface ConversationTaskMetadata {
  instructions: string;
  sharedContext?: string;
}

/** Bounded, redacted Agent Conversation View retained for one Agent Run. */
export interface AgentConversationView {
  taskId: string;
  profileId: string;
  entries: readonly ConversationEntry[];
  omittedEntryCount: number;
  /** Number of visible entry characters omitted by the retention bounds. */
  omittedCharacterCount: number;
  textTruncated: boolean;
  taskMetadata: ConversationTaskMetadata;
}

/** Options for building one Agent Conversation View. */
export interface ConversationViewOptions {
  taskId: string;
  profileId: string;
  messages: readonly AgentRunMessage[];
  /** Steering accepted by the overlay, including messages not yet present in the child session. */
  acceptedSteering?: readonly string[];
  taskMetadata: ConversationTaskMetadata;
}

// ── Build ────────────────────────────────────────────────────────

/** Build a bounded, redacted Conversation View from the session's message list. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: full message-stream transformation.
export function buildConversationView(options: ConversationViewOptions): AgentConversationView {
  const entries: ConversationEntry[] = [];
  const toolCallStatuses = new Map<string, "completed" | "error">();
  const toolCallNames = new Map<string, string>();

  // First pass: collect tool result statuses.
  for (const message of options.messages) {
    if (message.role !== "toolResult") continue;
    const id = message.toolCallId;
    if (typeof id !== "string") continue;
    const name = typeof message.toolName === "string" ? message.toolName : undefined;
    if (name) toolCallNames.set(id, name);
    toolCallStatuses.set(id, message.isError ? "error" : "completed");
  }

  // Track the index of the first user message (initial prompt) so we skip it.
  let firstUserSkipped = false;

  // Second pass: build entries from assistant and user messages.
  for (const message of options.messages) {
    if (message.role === "assistant") {
      const content = message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const blockType = block.type;
          // Text content → assistant entry
          if (blockType === "text" && typeof (block as { text?: string }).text === "string") {
            const text = (block as { text: string }).text;
            if (text.trim()) entries.push({ kind: "assistant", text: text.trim() });
          }
          // Tool call → tool entry with allowlisted summary
          else if (blockType === "toolCall" && typeof (block as { id?: string }).id === "string") {
            const tc = block as { id: string; name?: string; arguments?: unknown };
            const toolName =
              typeof tc.name === "string" ? tc.name : (toolCallNames.get(tc.id) ?? "unknown");
            const status = toolCallStatuses.get(tc.id) ?? "unknown";
            const summary = summarizeToolCall(toolName, tc.arguments);
            entries.push({
              kind: "tool",
              toolName,
              status,
              summary: summary.summary ?? undefined,
            });
          }
          // Skip thinking, signatures, redacted content
        }
      }
    } else if (message.role === "user") {
      // Skip the first user message (initial task prompt, shown as taskMetadata).
      if (!firstUserSkipped) {
        firstUserSkipped = true;
        continue;
      }
      // Retain subsequent user messages as steering entries.
      const content = message.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter(
                  (c): c is { type: "text"; text: string } =>
                    typeof c === "object" &&
                    c !== null &&
                    (c as { type?: string }).type === "text" &&
                    typeof (c as { text?: string }).text === "string",
                )
                .map((c) => c.text)
                .join("\n")
            : "";
      if (text.trim()) entries.push({ kind: "steering", text: text.trim() });
    }
  }

  const observedSteering = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === "steering") {
      observedSteering.set(entry.text, (observedSteering.get(entry.text) ?? 0) + 1);
    }
  }
  for (const text of options.acceptedSteering ?? []) {
    const observedCount = observedSteering.get(text) ?? 0;
    if (observedCount > 0) {
      observedSteering.set(text, observedCount - 1);
    } else if (text.trim()) {
      entries.push({ kind: "steering", text: text.trim() });
    }
  }

  // Bound by entry count (keep newest).
  const entryOmissions = Math.max(0, entries.length - MAX_CONVERSATION_ENTRIES);
  const boundedEntries = entryOmissions > 0 ? entries.slice(entryOmissions) : entries;

  // Bound by visible text: keep newest entries up to the character cap.
  let visibleChars = 0;
  let textKeepFrom = boundedEntries.length;
  let textTruncated = false;
  for (let i = boundedEntries.length - 1; i >= 0; i--) {
    const len = entryCharLength(boundedEntries[i]);
    if (visibleChars + len > MAX_CONVERSATION_TEXT_CHARS) {
      textKeepFrom = i + 1;
      textTruncated = true;
      break;
    }
    visibleChars += len;
    textKeepFrom = i;
  }

  const finalEntries = boundedEntries.slice(textKeepFrom);
  const totalOmissions = entryOmissions + textKeepFrom;
  const omittedCharacterCount =
    entryCharacterCount(entries.slice(0, entryOmissions)) +
    entryCharacterCount(boundedEntries.slice(0, textKeepFrom));

  return {
    taskId: options.taskId,
    profileId: options.profileId,
    entries: finalEntries,
    omittedEntryCount: totalOmissions,
    omittedCharacterCount,
    textTruncated,
    taskMetadata: options.taskMetadata,
  };
}

function entryCharLength(entry: ConversationEntry): number {
  switch (entry.kind) {
    case "assistant":
      return entry.text.length;
    case "steering":
      return entry.text.length;
    case "tool":
      return (entry.summary ?? entry.toolName).length;
  }
}

function entryCharacterCount(entries: readonly ConversationEntry[]): number {
  return entries.reduce((total, entry) => total + entryCharLength(entry), 0);
}
