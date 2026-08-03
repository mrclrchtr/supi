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
 * This includes assistant turns, tool-result work, compaction, and branch summaries.
 * When supplied, observed model-call usage also covers responses not persisted by PI after a failed recovery call.
 */
export function collectAgentRunUsage(
  session: AgentSession,
  observedUsages: readonly Usage[] = [],
): Usage | undefined {
  const fromObservedCalls = combineAgentRunUsage(observedUsages);

  try {
    const entries = session.sessionManager.getEntries();
    const fromEntries = combineAgentRunUsage(
      entries.map((entry) => {
        if (entry.type === "message") {
          return observedUsages.length > 0 && entry.message.role !== "toolResult"
            ? undefined
            : readUsage(entry.message);
        }
        if (entry.type === "compaction" || entry.type === "branch_summary") {
          return observedUsages.length === 0 || entry.fromHook ? readUsage(entry) : undefined;
        }
        return undefined;
      }),
    );
    const combined = combineAgentRunUsage([combineAgentRunUsage(observedUsages), fromEntries]);
    if (combined) return combined;
  } catch {
    // Test doubles and older PI versions may not expose session entries.
  }

  try {
    const messages = session.messages;
    if (Array.isArray(messages)) {
      const fromMessages = combineAgentRunUsage(
        messages.map((message) =>
          observedUsages.length > 0 && message.role !== "toolResult"
            ? undefined
            : readUsage(message),
        ),
      );
      const combined = combineAgentRunUsage([fromObservedCalls, fromMessages]);
      if (combined) return combined;
    }
  } catch {
    // Fall through to the best-effort stats snapshot.
  }

  if (fromObservedCalls) return fromObservedCalls;

  try {
    const stats = session.getSessionStats();
    const tokens = stats.tokens;
    if (tokens.input || tokens.output || tokens.cacheRead || tokens.cacheWrite) {
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
    }
  } catch {
    // Usage is optional when PI cannot expose a stable snapshot.
  }
  return undefined;
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
