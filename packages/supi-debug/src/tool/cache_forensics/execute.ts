import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadCacheForensicsConfig } from "../../cache/config.ts";
import { runForensics } from "../../cache/forensics/forensics.ts";
import { normalizeFindingsLimit } from "../../cache/forensics/types.ts";
import type { CacheForensicsParams } from "./input.ts";
import { buildForensicsResult, type ForensicsBoundQuery } from "./result.ts";

type ForensicsPattern = "hotspots" | "breakdown" | "correlate" | "idle";

/** Typed execute signature for cache_forensics. */
// biome-ignore lint/complexity/useMaxParams: pi tool execute signature
export type CacheForensicsExecute = (
  toolCallId: string,
  params: CacheForensicsParams,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<Record<string, unknown>> | undefined,
  ctx: ExtensionContext,
) => Promise<AgentToolResult<{ fullOutputPath?: string } | undefined>>;

/** Build the cache_forensics execute function. */
export function makeCacheForensicsExecute(): CacheForensicsExecute {
  // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
  return async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    const config = loadCacheForensicsConfig(ctx.cwd);
    const query: ForensicsBoundQuery = {
      pattern: (params.pattern as ForensicsPattern) ?? "breakdown",
      since: (params.since as string) ?? "7d",
      minDrop: (params.minDrop as number) ?? 0,
      maxSessions: (params.maxSessions as number) ?? 100,
      limit: normalizeFindingsLimit(params.limit),
    };
    const result = await runForensics({
      pattern: query.pattern as ForensicsPattern,
      since: query.since,
      minDrop: query.minDrop,
      maxSessions: query.maxSessions,
      maxFindings: query.limit,
      idleThresholdMinutes: config.idleThresholdMinutes,
      regressionThreshold: config.regressionThreshold,
    });

    return buildForensicsResult(result, query);
  };
}
