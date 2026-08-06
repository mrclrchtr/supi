import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

function addOptional(first: number | undefined, second: number | undefined): number | undefined {
  return first === undefined && second === undefined ? undefined : (first ?? 0) + (second ?? 0);
}

/** Add two PI Usage records while preserving optional reasoning/cache fields. */
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

/**
 * Collect every usage-bearing entry owned by the in-memory Agent Run session.
 * This includes assistant turns, tool-result work, compaction, branch summaries, and
 * finalized/live messages that have not reached session persistence yet.
 */
export function collectAgentRunUsage(session: AgentSession): Usage | undefined {
  const knownMessages = new Set<object>();
  const usages = [
    ...collectEntryUsage(session, knownMessages),
    ...collectLiveMessageUsage(session, knownMessages),
    collectStreamingUsage(session, knownMessages),
  ];
  return combineAgentRunUsage(usages) ?? collectStatsUsage(session);
}

function collectEntryUsage(session: AgentSession, knownMessages: Set<object>): Usage[] {
  const usages: Usage[] = [];
  try {
    for (const entry of session.sessionManager.getEntries()) {
      if (entry.type === "message") {
        if (isObject(entry.message)) knownMessages.add(entry.message);
        pushUsage(usages, entry.message);
      } else if (entry.type === "compaction" || entry.type === "branch_summary") {
        pushUsage(usages, entry);
      }
    }
  } catch {
    // Test doubles and older PI versions may not expose session entries.
  }
  return usages;
}

function collectLiveMessageUsage(session: AgentSession, knownMessages: Set<object>): Usage[] {
  const usages: Usage[] = [];
  try {
    for (const message of session.messages) {
      if (isObject(message) && knownMessages.has(message)) continue;
      if (isObject(message)) knownMessages.add(message);
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
): Usage | undefined {
  try {
    const message = session.agent.state.streamingMessage;
    if (isObject(message) && !knownMessages.has(message)) return readUsage(message);
  } catch {
    // Continue with the best-effort stats snapshot.
  }
  return undefined;
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
    },
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
}
