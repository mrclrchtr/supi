import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { loadCacheMonitorConfig } from "../../config.ts";
import { runForensics } from "../../forensics/forensics.ts";
import { stripHumanDetail } from "../../forensics/redact.ts";
import { buildForensicsResult, type ForensicsBoundQuery } from "./result.ts";
import type { cacheForensicsSpec } from "./spec.ts";

type ForensicsPattern = "hotspots" | "breakdown" | "correlate" | "idle";
type CacheForensicsParams = Static<(typeof cacheForensicsSpec)["parameters"]>;

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
    const config = loadCacheMonitorConfig(ctx.cwd);
    const query: ForensicsBoundQuery = {
      pattern: (params.pattern as string) ?? "breakdown",
      since: (params.since as string) ?? "7d",
      minDrop: (params.minDrop as number) ?? 0,
      maxSessions: (params.maxSessions as number) ?? 100,
    };
    const result = await runForensics({
      pattern: query.pattern as ForensicsPattern,
      since: query.since,
      minDrop: query.minDrop,
      maxSessions: query.maxSessions,
      idleThresholdMinutes: config.idleThresholdMinutes,
      regressionThreshold: config.regressionThreshold,
    });

    // Strip human-only detail before returning to agent
    if (result.findings) {
      result.findings = stripHumanDetail(result.findings);
    }

    return buildForensicsResult(result, query);
  };
}
