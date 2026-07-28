import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

function addOptional(first: number | undefined, second: number | undefined): number | undefined {
  return first === undefined && second === undefined ? undefined : (first ?? 0) + (second ?? 0);
}

/** Add two provider Usage records without dropping optional reasoning/cache fields. */
export function addUsage(first: Usage, second: Usage): Usage {
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

/** Sum available Usage records, returning undefined when no model call reported usage. */
export function combineUsage(usages: Array<Usage | undefined>): Usage | undefined {
  return usages.reduce<Usage | undefined>(
    (total, usage) => (usage ? (total ? addUsage(total, usage) : usage) : total),
    undefined,
  );
}

/** Snapshot aggregate assistant usage from one isolated child transcript. */
export function collectChildUsage(session: AgentSession): Usage | undefined {
  try {
    const messages = session.messages as unknown;
    if (!Array.isArray(messages)) return undefined;
    return combineUsage(
      messages.map((message) => {
        if (!message || typeof message !== "object") return undefined;
        const candidate = message as { role?: unknown; usage?: unknown };
        return candidate.role === "assistant" && isUsage(candidate.usage)
          ? candidate.usage
          : undefined;
      }),
    );
  } catch {
    return undefined;
  }
}

function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== "object") return false;
  const usage = value as Partial<Usage>;
  return (
    typeof usage.input === "number" &&
    typeof usage.output === "number" &&
    typeof usage.cacheRead === "number" &&
    typeof usage.cacheWrite === "number" &&
    typeof usage.totalTokens === "number" &&
    !!usage.cost &&
    typeof usage.cost.input === "number" &&
    typeof usage.cost.output === "number" &&
    typeof usage.cost.cacheRead === "number" &&
    typeof usage.cost.cacheWrite === "number" &&
    typeof usage.cost.total === "number"
  );
}
