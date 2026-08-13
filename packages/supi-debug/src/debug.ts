import { StringEnum } from "@earendil-works/pi-ai";
import type { AgentToolUpdateCallback, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerContextProvider } from "@mrclrchtr/supi-core/context";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  type DebugAgentAccess,
  type DebugEventQuery,
  type DebugEventView,
  getDebugEvents,
  getDebugSummary,
  isDebugOperationId,
  subscribeDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { resolveToolPath } from "@mrclrchtr/supi-core/path";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { Type } from "typebox";
import { registerDebugCommand } from "./command.ts";
import { formatDebugEvents, truncateDebugOutput } from "./output.ts";
import type { DebugToolParams } from "./query.ts";
import { createDebugRenderDetails } from "./render-details.ts";
import {
  registerDebugMessageRenderer,
  renderDebugToolCall,
  renderDebugToolResult,
} from "./renderer.ts";
import { DEBUG_EVENT_ENTRY_TYPE, readSessionDebugEvents } from "./session-events.ts";
import { maybeLogLoadStatus } from "./status-log.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";

const DEBUG_SECTION = "debug";
interface DebugConfig extends Record<string, unknown> {
  enabled: boolean;
  agentAccess: DebugAgentAccess;
  maxEvents: number;
}

const DEBUG_DEFAULTS: DebugConfig = { ...DEBUG_REGISTRY_DEFAULTS };

function normalizeAgentAccess(value: string): DebugAgentAccess {
  return value === "off" || value === "raw" ? value : "sanitized";
}

function normalizeMaxEvents(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEBUG_DEFAULTS.maxEvents;
}

function normalizeEnabled(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "on" ||
      normalized === "1" ||
      normalized === "yes"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === ""
    ) {
      return false;
    }
    return DEBUG_DEFAULTS.enabled;
  }

  if (value === 1) return true;
  if (value === 0) return false;
  return DEBUG_DEFAULTS.enabled;
}

function loadDebugConfig(cwd: string): DebugConfig {
  const config = loadSupiConfig(DEBUG_SECTION, cwd, DEBUG_DEFAULTS);
  return {
    enabled: normalizeEnabled(config.enabled),
    agentAccess: normalizeAgentAccess(String(config.agentAccess)),
    maxEvents: normalizeMaxEvents(config.maxEvents),
  };
}

function applyDebugConfig(cwd: string): DebugConfig {
  const config = loadDebugConfig(cwd);
  configureDebugRegistry(config);
  return config;
}

function syncLiveDebugRegistry(cwd: string): DebugConfig {
  const config = applyDebugConfig(cwd);
  if (!config.enabled) {
    clearDebugEvents();
  }
  return config;
}

function registerDebugSettings(pi: ExtensionAPI): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "debug",
      label: "Debug",
      section: DEBUG_SECTION,
      defaults: DEBUG_DEFAULTS,
      fields: [
        {
          kind: "boolean" as const,
          key: "enabled",
          label: "Enabled",
          description: "Enable/disable session-local SuPi debug event capture",
        },
        {
          kind: "enum" as const,
          key: "agentAccess",
          label: "Agent Access",
          description: "Control whether the agent can fetch sanitized or raw debug events",
          values: ["off", "sanitized", "raw"],
        },
        {
          kind: "number" as const,
          key: "maxEvents",
          label: "Max Events",
          description: "Maximum session-local debug events retained in memory",
          values: ["50", "100", "250", "500"],
        },
      ],
      afterPersist: ({ cwd }) => {
        syncLiveDebugRegistry(cwd);
      },
    }),
  );
}

function buildSummaryData(): Record<string, string | number> | null {
  const summary = getDebugSummary();
  if (!summary) return null;

  const data: Record<string, string | number> = { total: summary.total };
  for (const [level, count] of Object.entries(summary.byLevel)) {
    if (count !== undefined) data[`level:${level}`] = count;
  }
  for (const [source, count] of Object.entries(summary.bySource)) {
    data[`source:${source}`] = count;
  }
  return data;
}

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

interface DebugToolExecutionOptions {
  config: DebugConfig;
  cwd: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
}

async function buildToolResult(params: DebugToolParams, options: DebugToolExecutionOptions) {
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

/** Register the shared SuPi debug command, settings, context summary, and agent tool. */
export default function debugExtension(pi: ExtensionAPI) {
  applyDebugConfig(process.cwd());
  registerDebugSettings(pi);
  registerDebugMessageRenderer(pi);
  const unsubscribeDebugEvents = subscribeDebugEvents((event) => {
    pi.appendEntry(DEBUG_EVENT_ENTRY_TYPE, event);
  });

  registerContextProvider({
    id: "debug",
    label: "Debug",
    getData: buildSummaryData,
  });

  pi.on("session_start", async (_event, ctx) => {
    clearDebugEvents();
    applyDebugConfig(ctx.cwd);
  });

  pi.on("resources_discover", async (_event, ctx) => {
    maybeLogLoadStatus(pi, ctx.cwd, "resources_discover");
  });

  pi.on("session_shutdown", () => {
    unsubscribeDebugEvents();
  });

  registerDebugCommand(pi, applyDebugConfig, normalizeMaxEvents);

  pi.registerTool({
    name: "supi_debug",
    label: "SuPi Debug",
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    parameters: Type.Object({
      operationId: Type.Optional(
        Type.String({
          description: "Filter by exact Debug Operation ID",
          pattern: "^op-[A-Za-z0-9_-]{21}[AQgw]$",
        }),
      ),
      source: Type.Optional(Type.String({ description: "Filter by extension source, e.g. lsp" })),
      level: Type.Optional(
        StringEnum(["debug", "info", "warning", "error"], {
          description: "Filter by debug level",
        }),
      ),
      category: Type.Optional(Type.String({ description: "Filter by event category" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of events to return" })),
      sessionFile: Type.Optional(
        Type.String({ description: "PI session JSONL file containing persisted debug events" }),
      ),
      includeRaw: Type.Optional(
        Type.Boolean({ description: "Request raw event data when settings permit it" }),
      ),
    }),
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const query = params as DebugToolParams;
      if (query.operationId !== undefined && !isDebugOperationId(query.operationId)) {
        throw new Error("Invalid Debug Operation ID");
      }
      const config = applyDebugConfig(ctx.cwd);
      return buildToolResult(query, { config, cwd: ctx.cwd, signal, onUpdate });
    },
    renderCall: renderDebugToolCall,
    renderResult: renderDebugToolResult,
  });
}
