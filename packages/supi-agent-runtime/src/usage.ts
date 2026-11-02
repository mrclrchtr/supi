import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSession, SessionEntry } from "@earendil-works/pi-coding-agent";

function addOptional(first: number | undefined, second: number | undefined): number | undefined {
  return first === undefined && second === undefined ? undefined : (first ?? 0) + (second ?? 0);
}

/** A usage delta is provider-reported only when all contributing snapshots are. */
export function isProviderReportedUsageDelta(after: Usage, before: Usage | undefined): boolean {
  return (
    after.cost.totalFromProvider === true &&
    (before === undefined || before.cost.totalFromProvider === true)
  );
}

/** Add PI Usage records; the total is provider-reported only when both parts are. */
export function addAgentRunUsage(first: Usage, second: Usage): Usage {
  const cacheWrite1h = addOptional(first.cacheWrite1h, second.cacheWrite1h);
  const reasoning = addOptional(first.reasoning, second.reasoning);
  return {
    input: first.input + second.input,
    output: first.output + second.output,
    cacheRead: first.cacheRead + second.cacheRead,
    cacheWrite: first.cacheWrite + second.cacheWrite,
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
    totalTokens: first.totalTokens + second.totalTokens,
    cost: {
      input: first.cost.input + second.cost.input,
      output: first.cost.output + second.cost.output,
      cacheRead: first.cost.cacheRead + second.cost.cacheRead,
      cacheWrite: first.cost.cacheWrite + second.cost.cacheWrite,
      total: first.cost.total + second.cost.total,
      totalFromProvider:
        first.cost.totalFromProvider === true && second.cost.totalFromProvider === true,
    },
  };
}

/** Combine available usage records, returning undefined when none were reported. */
export function combineAgentRunUsage(usages: readonly (Usage | undefined)[]): Usage | undefined {
  return usages.reduce<Usage | undefined>(
    (total, usage) => (usage ? (total ? addAgentRunUsage(total, usage) : usage) : total),
    undefined,
  );
}

/** Historical data present before a restored Agent Run starts. */
export interface AgentRunUsageBaseline {
  readonly entryIds: ReadonlySet<string>;
  readonly messages: ReadonlySet<object>;
  /** Stable keys match projected copies created for native context edits. */
  readonly messageKeys: ReadonlySet<string>;
  readonly usage?: Usage;
}

/** Snapshot historical usage before the restored run starts. */
export function createAgentRunUsageBaseline(session: AgentSession): AgentRunUsageBaseline {
  const entryIds = new Set<string>();
  const messages = new Set<object>();
  const messageKeys = new Set<string>();
  try {
    for (const entry of session.sessionManager.getEntries()) {
      entryIds.add(entry.id);
      if (entry.type === "message") addBaselineMessage(entry.message, messages, messageKeys);
    }
  } catch {
    // Continue with the live session snapshot when test doubles omit session entries.
  }
  try {
    for (const message of session.messages) addBaselineMessage(message, messages, messageKeys);
  } catch {
    // Usage can still be collected from session entries.
  }
  return { entryIds, messages, messageKeys, usage: collectStatsUsage(session) };
}

/**
 * Collect billed usage created by this Agent Run. A baseline excludes imported session history.
 */
export function collectAgentRunUsage(
  session: AgentSession,
  baseline?: AgentRunUsageBaseline,
): Usage | undefined {
  const knownMessages = new Set<object>();
  const knownMessageKeys = new Set(baseline?.messageKeys);
  const entryUsages = collectEntryUsage(
    session,
    knownMessages,
    knownMessageKeys,
    baseline?.entryIds,
  );
  const usages = [
    ...entryUsages,
    ...collectLiveMessageUsage(session, knownMessages, knownMessageKeys, baseline?.messages),
    collectStreamingUsage(session, knownMessages, knownMessageKeys, baseline?.messages),
  ];
  const collected = combineAgentRunUsage(usages);
  if (collected) return collected;
  const currentStats = collectStatsUsage(session);
  return baseline ? subtractUsage(currentStats, baseline.usage) : currentStats;
}

interface EntryUsageCollector {
  readonly usages: Usage[];
  readonly knownMessages: Set<object>;
  readonly knownMessageKeys: Set<string>;
  readonly historicalEntryIds?: ReadonlySet<string>;
}

function collectEntryUsage(
  session: AgentSession,
  knownMessages: Set<object>,
  knownMessageKeys: Set<string>,
  historicalEntryIds?: ReadonlySet<string>,
): Usage[] {
  const collector: EntryUsageCollector = {
    usages: [],
    knownMessages,
    knownMessageKeys,
    historicalEntryIds,
  };
  try {
    for (const entry of session.sessionManager.getEntries()) {
      collectEntryUsageItem(entry, collector);
    }
  } catch {
    // Test doubles and older PI versions may not expose session entries.
  }
  return collector.usages;
}

function collectEntryUsageItem(entry: SessionEntry, collector: EntryUsageCollector): void {
  const { historicalEntryIds, knownMessages, knownMessageKeys, usages } = collector;
  if (entry.type === "message") {
    if (isObject(entry.message)) knownMessages.add(entry.message);
    const key = historicalEntryIds ? getMessageKey(entry.message) : undefined;
    if (key) knownMessageKeys.add(key);
    if (!historicalEntryIds?.has(entry.id)) pushUsage(usages, entry.message);
    return;
  }
  if (historicalEntryIds?.has(entry.id)) return;
  if (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary") {
    pushUsage(usages, entry);
  }
}

function addBaselineMessage(
  message: unknown,
  messages: Set<object>,
  messageKeys: Set<string>,
): void {
  if (isObject(message)) messages.add(message);
  const key = getMessageKey(message);
  if (key) messageKeys.add(key);
}

function collectLiveMessageUsage(
  session: AgentSession,
  knownMessages: Set<object>,
  knownMessageKeys: Set<string>,
  historicalMessages?: ReadonlySet<object>,
): Usage[] {
  const usages: Usage[] = [];
  try {
    for (const message of session.messages) {
      const messageKey = historicalMessages ? getMessageKey(message) : undefined;
      if (
        isObject(message) &&
        (knownMessages.has(message) ||
          historicalMessages?.has(message) ||
          (historicalMessages !== undefined &&
            messageKey !== undefined &&
            knownMessageKeys.has(messageKey)))
      ) {
        continue;
      }
      if (isObject(message)) knownMessages.add(message);
      if (historicalMessages !== undefined && messageKey) knownMessageKeys.add(messageKey);
      pushUsage(usages, message);
    }
  } catch {
    // Continue with streaming state and the best-effort stats snapshot.
  }
  return usages;
}

function collectStreamingUsage(
  session: AgentSession,
  knownMessages: Set<object>,
  knownMessageKeys: Set<string>,
  historicalMessages?: ReadonlySet<object>,
): Usage | undefined {
  try {
    const message = session.agent.state.streamingMessage;
    const messageKey = historicalMessages ? getMessageKey(message) : undefined;
    if (
      isObject(message) &&
      !knownMessages.has(message) &&
      !historicalMessages?.has(message) &&
      !(
        historicalMessages !== undefined &&
        messageKey !== undefined &&
        knownMessageKeys.has(messageKey)
      )
    ) {
      return readUsage(message);
    }
  } catch {
    // Continue with the best-effort stats snapshot.
  }
  return undefined;
}

function getMessageKey(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const message = value as Record<string, unknown>;
  if (
    typeof message.role !== "string" ||
    (typeof message.timestamp !== "number" && typeof message.timestamp !== "string")
  ) {
    return undefined;
  }
  const usage = normalizeUsage(message.usage);
  if (!usage) return undefined;
  return JSON.stringify([
    message.role,
    message.timestamp,
    message.provider,
    message.model,
    message.toolCallId,
    message.toolName,
    message.stopReason,
    usage,
  ]);
}

function collectStatsUsage(session: AgentSession): Usage | undefined {
  try {
    const stats = session.getSessionStats();
    const tokens = stats.tokens;
    if (!tokens.input && !tokens.output && !tokens.cacheRead && !tokens.cacheWrite)
      return undefined;
    return {
      input: tokens.input,
      output: tokens.output,
      cacheRead: tokens.cacheRead,
      cacheWrite: tokens.cacheWrite,
      totalTokens: tokens.total,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: stats.cost,
      },
    };
  } catch {
    // Usage is optional when PI cannot expose a stable snapshot.
    return undefined;
  }
}

function pushUsage(usages: Usage[], value: unknown): void {
  const usage = readUsage(value);
  if (usage) usages.push(usage);
}

function subtractUsage(after: Usage | undefined, before: Usage | undefined): Usage | undefined {
  if (!after) return undefined;
  const difference = (next: number, previous: number | undefined) =>
    Math.max(0, next - (previous ?? 0));
  const usage: Usage = {
    input: difference(after.input, before?.input),
    output: difference(after.output, before?.output),
    cacheRead: difference(after.cacheRead, before?.cacheRead),
    cacheWrite: difference(after.cacheWrite, before?.cacheWrite),
    totalTokens: difference(after.totalTokens, before?.totalTokens),
    cost: {
      input: difference(after.cost.input, before?.cost.input),
      output: difference(after.cost.output, before?.cost.output),
      cacheRead: difference(after.cost.cacheRead, before?.cost.cacheRead),
      cacheWrite: difference(after.cost.cacheWrite, before?.cost.cacheWrite),
      total: difference(after.cost.total, before?.cost.total),
      totalFromProvider: isProviderReportedUsageDelta(after, before),
    },
  };
  return usage.input || usage.output || usage.cacheRead || usage.cacheWrite || usage.cost.total
    ? usage
    : undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function readUsage(value: unknown): Usage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { usage?: unknown };
  return normalizeUsage(candidate.usage ?? value);
}

function normalizeUsage(value: unknown): Usage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.input !== "number" ||
    typeof candidate.output !== "number" ||
    typeof candidate.cacheRead !== "number" ||
    typeof candidate.cacheWrite !== "number" ||
    typeof candidate.totalTokens !== "number"
  ) {
    return undefined;
  }
  const cost = candidate.cost;
  const costRecord = cost && typeof cost === "object" ? (cost as Record<string, unknown>) : {};
  const numberOrZero = (number: unknown) => (typeof number === "number" ? number : 0);
  const optionalNumber = (number: unknown) => (typeof number === "number" ? number : undefined);
  const cacheWrite1h = optionalNumber(candidate.cacheWrite1h);
  const reasoning = optionalNumber(candidate.reasoning);
  return {
    input: candidate.input,
    output: candidate.output,
    cacheRead: candidate.cacheRead,
    cacheWrite: candidate.cacheWrite,
    totalTokens: candidate.totalTokens,
    cost: {
      input: numberOrZero(costRecord.input),
      output: numberOrZero(costRecord.output),
      cacheRead: numberOrZero(costRecord.cacheRead),
      cacheWrite: numberOrZero(costRecord.cacheWrite),
      total: numberOrZero(costRecord.total),
      ...(typeof costRecord.totalFromProvider === "boolean"
        ? { totalFromProvider: costRecord.totalFromProvider }
        : {}),
    },
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
}
