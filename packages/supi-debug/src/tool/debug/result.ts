import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";
import {
  type DebugEventQuery,
  type DebugEventView,
  getDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { resolveToolPath } from "@mrclrchtr/supi-core/path";
import type { DebugConfig } from "../../config.ts";
import { formatDebugEvents, truncateDebugOutput } from "../../format-events.ts";
import type { DebugToolParams } from "../../query.ts";
import { createDebugRenderDetails, type DebugRenderDetails } from "../../render-details.ts";
import { readSessionDebugEvents } from "../../session-events.ts";
import type { DebugToolOutput } from "./result-schema.ts";
import { serializeDebugEvents } from "./serialize.ts";

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

/** Final native result with separate machine-readable evidence and bounded transcript details. */
export type DebugToolResult = AgentToolResult<DebugRenderDetails> & {
  structuredContent: DebugToolOutput;
};

function getEmptyReason(
  returnedEventCount: number,
  matchedEventCount: number,
  provenance: DebugToolOutput["provenance"],
): DebugToolOutput["emptyReason"] {
  if (returnedEventCount > 0) return undefined;
  if (matchedEventCount > 0) return "query-limit";
  return provenance.kind === "persisted" &&
    provenance.persistedEventCount === 0 &&
    provenance.malformedLineCount === 0
    ? "no-persisted-events"
    : "no-matches";
}

function formatResult(evidence: DebugToolOutput) {
  const { events, selection, provenance, rawAccessDenied, rawDataUnavailable } = evidence;
  const persisted = provenance.kind === "persisted" ? provenance : undefined;
  const lines = formatDebugEvents(events, rawAccessDenied, rawDataUnavailable, {
    persistedEventCount: persisted?.persistedEventCount,
    invalidEventCount: persisted?.invalidEventCount,
    malformedLineCount: persisted?.malformedLineCount,
    queryLimitExcludedAll: evidence.emptyReason === "query-limit",
  });
  if (selection.omittedEventCount > 0) {
    lines.unshift(
      `Showing ${selection.returnedEventCount} of ${selection.matchedEventCount} matching debug events; ${selection.omittedEventCount} omitted by limit.`,
    );
  }
  if (evidence.dataNormalized)
    lines.push("Non-JSON diagnostic values were normalized to text markers.");
  return truncateDebugOutput(lines.join("\n"));
}

/** Assemble both result representations from the same selected event facts. */
export async function buildToolResult(
  params: DebugToolParams,
  options: DebugToolExecutionOptions,
): Promise<DebugToolResult> {
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
  let matchedEventCount: number;
  let invalidEventCount = 0;
  let malformedLineCount = 0;
  let provenance: DebugToolOutput["provenance"];
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
    matchedEventCount = persisted.matchedEventCount;
    invalidEventCount = persisted.invalidEventCount;
    malformedLineCount = persisted.malformedLineCount;
    provenance = {
      kind: "persisted",
      sessionFile,
      persistedEventCount,
      invalidEventCount,
      malformedLineCount,
    };
    rawAccessDenied = Boolean(params.includeRaw);
    rawDataUnavailable = rawAccessDenied;
  } else {
    // The live registry is already retention-bounded. Select locally so omission counts are exact.
    const result = getDebugEvents({ ...query, limit: undefined });
    matchedEventCount = result.events.length;
    const limit = params.limit && params.limit > 0 ? Math.floor(params.limit) : matchedEventCount;
    events = result.events.slice(0, limit);
    rawAccessDenied = result.rawAccessDenied;
    provenance = { kind: "live", scope: "retained-buffer" };
  }
  const serialized = serializeDebugEvents(events);
  const omittedEventCount = matchedEventCount - serialized.events.length;
  const emptyReason = getEmptyReason(serialized.events.length, matchedEventCount, provenance);
  const structuredContent: DebugToolOutput = {
    ...serialized,
    provenance,
    selection: {
      matchedEventCount,
      returnedEventCount: serialized.events.length,
      omittedEventCount,
      complete: omittedEventCount === 0 && invalidEventCount === 0 && malformedLineCount === 0,
    },
    rawAccessDenied,
    rawDataUnavailable,
    ...(emptyReason === undefined ? {} : { emptyReason }),
    modelOutput: { truncated: false },
  };
  const output = formatResult(structuredContent);
  if (output.truncation) {
    structuredContent.modelOutput = {
      truncated: true,
      outputLines: output.truncation.outputLines,
      totalLines: output.truncation.totalLines,
      outputBytes: output.truncation.outputBytes,
      totalBytes: output.truncation.totalBytes,
    };
  }
  const details = createDebugRenderDetails(serialized.events, {
    enabled: config.enabled,
    agentAccess: config.agentAccess,
    sessionFile: params.sessionFile,
    rawAccessDenied,
    rawDataUnavailable,
    persistedEventCount,
    eventCount: structuredContent.selection.returnedEventCount,
    queryOmittedEventCount: structuredContent.selection.omittedEventCount,
    invalidEventCount,
    malformedLineCount,
    emptyReason,
    truncation: output.truncation,
  });

  return {
    content: [{ type: "text" as const, text: output.text }],
    details,
    structuredContent,
  };
}
