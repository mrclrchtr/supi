import type { AntigravityUsage } from "../types.ts";
import { isRecord } from "./event-values.ts";

/** Read bounded token usage from one normalized Antigravity event. */
export function readUsage(event: Record<string, unknown>): AntigravityUsage | undefined {
  const value = isRecord(event.usage)
    ? event.usage
    : isRecord(event.token_usage)
      ? event.token_usage
      : isRecord(event.tokenUsage)
        ? event.tokenUsage
        : undefined;
  if (!value) return undefined;
  const inputTokens = finiteToken(value.input_tokens ?? value.inputTokens ?? value.prompt_tokens);
  const outputTokens = finiteToken(
    value.output_tokens ?? value.outputTokens ?? value.completion_tokens,
  );
  const totalTokens = finiteToken(value.total_tokens ?? value.totalTokens ?? value.total);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined)
    return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

/** Merge usage fields without retaining any provider event payload. */
export function mergeUsage(
  left: AntigravityUsage | undefined,
  right: AntigravityUsage | undefined,
): AntigravityUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    ...(left.inputTokens === undefined && right.inputTokens === undefined
      ? {}
      : { inputTokens: right.inputTokens ?? left.inputTokens }),
    ...(left.outputTokens === undefined && right.outputTokens === undefined
      ? {}
      : { outputTokens: right.outputTokens ?? left.outputTokens }),
    ...(left.totalTokens === undefined && right.totalTokens === undefined
      ? {}
      : { totalTokens: right.totalTokens ?? left.totalTokens }),
  };
}

function finiteToken(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
