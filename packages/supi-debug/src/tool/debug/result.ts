import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import {
  type DebugEventQuery,
  type DebugEventView,
  getDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { resolveToolPath } from "@mrclrchtr/supi-core/path";
import type { DebugConfig } from "../../config.ts";
import { formatDebugEvents, truncateDebugOutput } from "../../format-events.ts";
import type { DebugToolParams } from "../../query.ts";
import { createDebugRenderDetails } from "../../render-details.ts";
import { readSessionDebugEvents } from "../../session-events.ts";

interface DebugProgressDetails {
  scannedLines: number;
  persistedEventCount: number;
  matchedEvents: number;
}

function reportDebugProgress(
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  progress: DebugProgressDetails,
): void {
  onUpdate?.({
    content: [
      {
        type: "text",
        text: `Reading persisted debug events: ${progress.matchedEvents} matching events found.`,
      },
    ],
    details: progress,
  });
}

export interface DebugToolExecutionOptions {
  config: DebugConfig;
  cwd: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
}

/** Assemble the model-facing debug tool result for one query. */
export async function buildToolResult(params: DebugToolParams, options: DebugToolExecutionOptions) {
  const { config, cwd, signal, onUpdate } = options;
  if (!config.enabled && !params.sessionFile) {
    throw new Error(
      "SuPi debug event capture is disabled. Enable Debug in /supi-settings to retain events.",
    );
  }

  if (config.agentAccess === "off") {
    throw new Error("Agent access to SuPi debug events is disabled.");
  }

  const filters = {
    operationId: params.operationId,
    source: params.source,
    level: params.level,
    category: params.category,
    limit: params.limit,
  };
  const query: DebugEventQuery = {
    ...filters,
    includeRaw: params.includeRaw,
    allowRaw: config.agentAccess === "raw",
  };
  let events: DebugEventView[];
  let rawAccessDenied: boolean;
  let rawDataUnavailable = false;
  let persistedEventCount: number | undefined;
  if (params.sessionFile) {
    const sessionFile = resolveToolPath(cwd, params.sessionFile);
    const persisted =
      signal || onUpdate
        ? await readSessionDebugEvents(sessionFile, filters, {
            signal,
            onProgress: (progress) => reportDebugProgress(onUpdate, progress),
          })
        : await readSessionDebugEvents(sessionFile, filters);
    events = persisted.events;
    persistedEventCount = persisted.persistedEventCount;
    rawAccessDenied = Boolean(params.includeRaw);
    rawDataUnavailable = rawAccessDenied;
  } else {
    const result = getDebugEvents(query);
    events = result.events;
    rawAccessDenied = result.rawAccessDenied;
  }
  const output = truncateDebugOutput(
    formatDebugEvents(events, rawAccessDenied, rawDataUnavailable, persistedEventCount).join("\n"),
  );
  const details = createDebugRenderDetails(events, {
    enabled: config.enabled,
    agentAccess: config.agentAccess,
    sessionFile: params.sessionFile,
    rawAccessDenied,
    rawDataUnavailable,
    persistedEventCount,
    eventCount: events.length,
    emptyReason:
      events.length === 0
        ? persistedEventCount === 0
          ? "no-persisted-events"
          : "no-matches"
        : undefined,
    truncation: output.truncation,
  });

  return {
    content: [{ type: "text" as const, text: output.text }],
    details,
  };
}
