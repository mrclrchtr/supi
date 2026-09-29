import type { SessionProjection } from "@earendil-works/pi-coding-agent";

export const PROMPT_IMPROVER_LIMITS = {
  draftCodePoints: 32_000,
  guidanceCodePoints: 12_000,
  conversationCodePoints: 12_000,
  conversationMessages: 12,
  summaryCodePoints: 4_000,
  maxQuestions: 3,
} as const;

export interface GuidanceRecord {
  readonly path: string;
  readonly content: string;
}

export interface ConversationRecord {
  readonly role: "user" | "assistant";
  readonly sourceId: string;
  readonly text: string;
}

export interface SummaryRecord {
  readonly source: "compaction" | "branch";
  readonly sourceId: string;
  readonly text: string;
}

/** One immutable, bounded background snapshot for an improvement session. */
export interface PromptImproverContext {
  readonly guidance: readonly GuidanceRecord[];
  readonly conversation: readonly ConversationRecord[];
  readonly summary?: SummaryRecord;
}

/**
 * Select loaded guidance and projected conversation text without disk reads.
 * The projection is the only source for ordinary user and assistant messages.
 */
export function selectPromptImproverContext(
  contextFiles: readonly { path: string; content: string }[],
  projection: SessionProjection,
): PromptImproverContext {
  const guidance = selectGuidance(contextFiles);
  const conversation = selectConversation(projection);
  const summary = selectSummary(projection);
  return Object.freeze({
    guidance: Object.freeze(guidance),
    conversation: Object.freeze(conversation),
    ...(summary ? { summary: Object.freeze(summary) } : {}),
  });
}

/** Make a smaller immutable view by dropping oldest messages, then the summary. */
export function reducePromptImproverContext(
  context: PromptImproverContext,
  dropMessageCount: number,
  dropSummary: boolean,
  dropGuidanceCount: number = 0,
): PromptImproverContext {
  const conversation = context.conversation.slice(dropMessageCount);
  const guidance = context.guidance.slice(0, context.guidance.length - dropGuidanceCount);
  return Object.freeze({
    guidance: Object.freeze(guidance),
    conversation: Object.freeze(conversation),
    ...(!dropSummary && context.summary ? { summary: context.summary } : {}),
  });
}

export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

/** Return useful size and count facts for one selected context snapshot. */
export function promptImproverContextCounts(
  context: PromptImproverContext,
): Record<string, number | boolean> {
  return {
    guidanceFiles: context.guidance.length,
    guidanceCodePoints: context.guidance.reduce(
      (total, item) => total + countCodePoints(item.content),
      0,
    ),
    conversationMessages: context.conversation.length,
    conversationCodePoints: context.conversation.reduce(
      (total, item) => total + countCodePoints(item.text),
      0,
    ),
    summaryIncluded: Boolean(context.summary),
    summaryCodePoints: context.summary ? countCodePoints(context.summary.text) : 0,
  };
}

function selectGuidance(records: readonly { path: string; content: string }[]): GuidanceRecord[] {
  if (!Array.isArray(records)) throw new Error("Loaded project guidance is unavailable.");
  const selected: GuidanceRecord[] = [];
  let used = 0;
  for (const record of records) {
    if (!record || typeof record.path !== "string" || typeof record.content !== "string") {
      throw new Error("Loaded project guidance is unavailable.");
    }
    const size = countCodePoints(record.content);
    if (used + size > PROMPT_IMPROVER_LIMITS.guidanceCodePoints) continue;
    selected.push(Object.freeze({ path: record.path, content: record.content }));
    used += size;
  }
  return selected;
}

function selectConversation(projection: SessionProjection): ConversationRecord[] {
  const eligible = projection.entries.flatMap((entry) => {
    const record = toConversationRecord(entry);
    return record ? [record] : [];
  });
  const selected: ConversationRecord[] = [];
  let used = 0;
  for (let index = eligible.length - 1; index >= 0; index -= 1) {
    const item = eligible[index];
    if (!item || selected.length >= PROMPT_IMPROVER_LIMITS.conversationMessages) break;
    const size = countCodePoints(item.text);
    if (used + size > PROMPT_IMPROVER_LIMITS.conversationCodePoints) continue;
    selected.push(Object.freeze({ ...item }));
    used += size;
  }
  return selected.reverse();
}

function toConversationRecord(
  entry: SessionProjection["entries"][number],
): ConversationRecord | undefined {
  const source = entry.sourceEntry;
  if (source.type !== "message") return undefined;
  if (source.message.role !== "user" && source.message.role !== "assistant") return undefined;
  const text = entry.messages.flatMap(readProjectedText).join("\n");
  if (!text.trim()) return undefined;
  return { role: source.message.role, sourceId: source.id, text };
}

function readProjectedText(message: SessionProjection["messages"][number]): string[] {
  if (message.role !== "user" && message.role !== "assistant") return [];
  const content: unknown = message.content;
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part: unknown) => {
    if (
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return [part.text];
    }
    return [];
  });
}

function selectSummary(projection: SessionProjection): SummaryRecord | undefined {
  for (let index = projection.entries.length - 1; index >= 0; index -= 1) {
    const projected = projection.entries[index];
    const source = projected?.sourceEntry;
    if (source?.type !== "compaction" && source?.type !== "branch_summary") continue;
    if (
      !projected.messages.some(
        (message) => message.role === "compactionSummary" || message.role === "branchSummary",
      )
    ) {
      continue;
    }
    if (
      !source.summary ||
      countCodePoints(source.summary) > PROMPT_IMPROVER_LIMITS.summaryCodePoints
    ) {
      continue;
    }
    return Object.freeze({
      source: source.type === "compaction" ? "compaction" : "branch",
      sourceId: source.id,
      text: source.summary,
    });
  }
  return undefined;
}
