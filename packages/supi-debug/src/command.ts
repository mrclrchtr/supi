import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getDebugEvents } from "@mrclrchtr/supi-core/debug";
import { resolveToolPath } from "@mrclrchtr/supi-core/path";
import { formatDebugEvents, truncateDebugOutput } from "./format-events.ts";
import type { DebugToolParams } from "./query.ts";
import { parseDebugCommandArgs } from "./query.ts";
import { createDebugMessageDetails } from "./renderer.ts";
import { readSessionDebugEvents } from "./session-events.ts";

const DEBUG_REPORT_TYPE = "supi-debug-report";

interface DebugConfig {
  enabled: boolean;
}

interface DebugCommandDependencies {
  pi: ExtensionAPI;
  applyConfig: (cwd: string) => DebugConfig;
  normalizeLimit: (value: string) => number;
}

function persistedDebugFilters(query: DebugToolParams) {
  return {
    operationId: query.operationId,
    source: query.source,
    level: query.level,
    category: query.category,
    limit: query.limit,
  };
}

async function sendPersistedDebugReport(
  query: DebugToolParams,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const statusKey = "supi-debug";
  const setStatus = ctx.ui?.setStatus;
  try {
    const filters = persistedDebugFilters(query);
    if (!query.sessionFile)
      throw new Error("A session file is required for historical debug events.");
    const sessionFile = resolveToolPath(ctx.cwd, query.sessionFile);
    const persisted =
      ctx.signal || setStatus
        ? await readSessionDebugEvents(sessionFile, filters, {
            signal: ctx.signal,
            onProgress: (progress) => {
              setStatus?.(
                statusKey,
                `Reading debug events: ${progress.scannedLines.toLocaleString("en-US")} lines · ${progress.matchedEvents.toLocaleString("en-US")} matches`,
              );
            },
          })
        : await readSessionDebugEvents(sessionFile, filters);
    const output = truncateDebugOutput(
      formatDebugEvents(persisted.events, false, false, persisted.persistedEventCount).join("\n"),
    );
    pi.sendMessage({
      customType: DEBUG_REPORT_TYPE,
      content: output.text,
      display: true,
      details: createDebugMessageDetails(persisted.events, {
        sessionFile: query.sessionFile,
        persistedEventCount: persisted.persistedEventCount,
        eventCount: persisted.events.length,
        emptyReason:
          persisted.events.length === 0
            ? persisted.persistedEventCount === 0
              ? "no-persisted-events"
              : "no-matches"
            : undefined,
        truncation: output.truncation,
      }),
    });
  } finally {
    setStatus?.(statusKey, undefined);
  }
}

function sendLiveDebugReport(query: DebugToolParams, pi: ExtensionAPI): void {
  const { events, rawAccessDenied } = getDebugEvents(query);
  const output = truncateDebugOutput(formatDebugEvents(events, rawAccessDenied).join("\n"));
  pi.sendMessage({
    customType: DEBUG_REPORT_TYPE,
    content: output.text,
    display: true,
    details: createDebugMessageDetails(events, {
      rawAccessDenied,
      eventCount: events.length,
      emptyReason: events.length === 0 ? "no-matches" : undefined,
      truncation: output.truncation,
    }),
  });
}

async function handleDebugCommand(
  args: string,
  ctx: ExtensionCommandContext,
  dependencies: DebugCommandDependencies,
): Promise<void> {
  const { pi, applyConfig, normalizeLimit } = dependencies;
  const config = applyConfig(ctx.cwd);
  const query = parseDebugCommandArgs(args, normalizeLimit);
  if (!config.enabled && !query.sessionFile) {
    pi.sendMessage({
      customType: DEBUG_REPORT_TYPE,
      content: "SuPi debug event capture is disabled. Enable Debug in /supi-settings.",
      display: true,
    });
    return;
  }

  if (query.sessionFile) {
    await sendPersistedDebugReport(query, ctx, pi);
    return;
  }
  sendLiveDebugReport(query, pi);
}

/** Register the user-facing debug command. */
export function registerDebugCommand(
  pi: ExtensionAPI,
  applyConfig: (cwd: string) => DebugConfig,
  normalizeLimit: (value: string) => number,
): void {
  const dependencies = { pi, applyConfig, normalizeLimit };
  pi.registerCommand("supi-debug", {
    description: "Show recent SuPi debug events",
    handler: (args, ctx) => handleDebugCommand(args, ctx, dependencies),
  });
}
