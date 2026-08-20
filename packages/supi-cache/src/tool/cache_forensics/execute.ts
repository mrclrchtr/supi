import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { loadCacheMonitorConfig } from "../../config.ts";
import { runForensics } from "../../forensics/forensics.ts";
import { stripHumanDetail } from "../../forensics/redact.ts";
import { boundForensicsOutput } from "./result.ts";
import type { cacheForensicsSpec } from "./spec.ts";

type ForensicsPattern = "hotspots" | "breakdown" | "correlate" | "idle";
type CacheForensicsParams = Static<(typeof cacheForensicsSpec)["parameters"]>;
type CacheForensicsExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the cache_forensics execute function. */
export function makeCacheForensicsExecute(): CacheForensicsExecute {
  // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
  return async (_toolCallId, rawParams, _signal, _onUpdate, ctx) => {
    const params = rawParams as CacheForensicsParams;
    const config = loadCacheMonitorConfig(ctx.cwd);
    const result = await runForensics({
      pattern: params.pattern as ForensicsPattern,
      since: (params.since as string) ?? "7d",
      minDrop: (params.minDrop as number) ?? 0,
      maxSessions: (params.maxSessions as number) ?? 100,
      idleThresholdMinutes: config.idleThresholdMinutes,
      regressionThreshold: config.regressionThreshold,
    });

    // Strip human-only detail before returning to agent
    if (result.findings) {
      result.findings = stripHumanDetail(result.findings);
    }

    const output = boundForensicsOutput(result, {
      pattern: params.pattern as ForensicsPattern,
      since: (params.since as string) ?? "7d",
      minDrop: (params.minDrop as number) ?? 0,
      maxSessions: (params.maxSessions as number) ?? 100,
    });

    return {
      content: [{ type: "text", text: output.text }],
      details: output.fullOutputPath ? { fullOutputPath: output.fullOutputPath } : undefined,
    };
  };
}
