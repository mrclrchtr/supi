import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  type DebugAgentAccess,
  type DebugEventQuery,
  type DebugEventView,
  type DebugLevel,
  type DebugNotifyLevel,
  getDebugEvents,
  getDebugSummary,
  loadSupiConfig,
  registerConfigSettings,
  registerContextProvider,
} from "@mrclrchtr/supi-core";
import { Type } from "typebox";
import { maybeLogLoadStatus } from "../status-log.ts";
import { formatDataLines } from "./format.ts";
import { registerDebugMessageRenderer } from "./renderer.ts";

const DEBUG_SECTION = "debug";
const DEBUG_REPORT_TYPE = "supi-debug-report";

interface DebugConfig {
  enabled: boolean;
  agentAccess: DebugAgentAccess;
  maxEvents: number;
  notifyLevel: DebugNotifyLevel;
}

const DEBUG_DEFAULTS: DebugConfig = { ...DEBUG_REGISTRY_DEFAULTS };

type DebugToolParams = DebugEventQuery;

function normalizeAgentAccess(value: string): DebugAgentAccess {
  return value === "off" || value === "raw" ? value : "sanitized";
}

function normalizeNotifyLevel(value: string): DebugNotifyLevel {
  return value === "warning" || value === "error" ? value : "off";
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
    notifyLevel: normalizeNotifyLevel(String(config.notifyLevel)),
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

function registerDebugSettings(): void {
  registerConfigSettings({
    id: "debug",
    label: "Debug",
    section: DEBUG_SECTION,
    defaults: DEBUG_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "enabled",
        label: "Enabled",
        description: "Enable/disable session-local SuPi debug event capture",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "agentAccess",
        label: "Agent Access",
        description: "Control whether the agent can fetch sanitized or raw debug events",
        currentValue: normalizeAgentAccess(String(settings.agentAccess)),
        values: ["off", "sanitized", "raw"],
      },
      {
        id: "maxEvents",
        label: "Max Events",
        description: "Maximum session-local debug events retained in memory",
        currentValue: String(normalizeMaxEvents(settings.maxEvents)),
        values: ["50", "100", "250", "500"],
      },
      {
        id: "notifyLevel",
        label: "Notify Level",
        description: "Minimum debug event severity that may notify the user",
        currentValue: normalizeNotifyLevel(String(settings.notifyLevel)),
        values: ["off", "warning", "error"],
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, cwd, settingId, value, helpers) => {
      if (settingId === "enabled") {
        helpers.set("enabled", value === "on");
      } else if (settingId === "agentAccess") {
        helpers.set("agentAccess", normalizeAgentAccess(value));
      } else if (settingId === "maxEvents") {
        helpers.set("maxEvents", normalizeMaxEvents(value));
      } else if (settingId === "notifyLevel") {
        helpers.set("notifyLevel", normalizeNotifyLevel(value));
      }

      syncLiveDebugRegistry(cwd);
    },
  });
}

function parseCommandArgs(args: string): DebugEventQuery {
  const query: DebugEventQuery = {};
  const parts = args.trim().split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (!value) continue;
    if (key === "source") query.source = value;
    if (key === "category") query.category = value;
    if (key === "level" && isDebugLevel(value)) query.level = value;
    if (key === "limit") query.limit = normalizeMaxEvents(value);
  }
  return query;
}

function isDebugLevel(value: string): value is DebugLevel {
  return value === "debug" || value === "info" || value === "warning" || value === "error";
}

function pushFormattedData(lines: string[], label: string, value: unknown): void {
  const dataLines = formatDataLines(value);
  if (dataLines.length === 0) return;
  if (dataLines.length === 1) {
    lines.push(`  ${label}: ${dataLines[0]}`);
  } else {
    lines.push(`  ${label}:`);
    for (const dl of dataLines) {
      lines.push(`    ${dl}`);
    }
  }
}

function formatEvents(events: DebugEventView[], rawAccessDenied: boolean): string[] {
  if (events.length === 0) {
    return ["No matching debug events available."];
  }

  const lines: string[] = [];
  for (const event of events) {
    lines.push(
      `[${new Date(event.timestamp).toISOString()}] ${event.level.toUpperCase()} ${event.source}/${event.category}: ${event.message}`,
    );
    if (event.cwd) lines.push(`  cwd: ${event.cwd}`);
    pushFormattedData(lines, "data", event.data);
    pushFormattedData(lines, "rawData", event.rawData);
  }
  if (rawAccessDenied) {
    lines.push("");
    lines.push("Raw debug data was requested but is not enabled in SuPi Debug settings.");
  }
  return lines;
}

function formatEventLines(query: DebugEventQuery): string[] {
  const { events, rawAccessDenied } = getDebugEvents(query);
  return formatEvents(events, rawAccessDenied);
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

function toolAccessAllowed(config: DebugConfig): boolean {
  return config.enabled && config.agentAccess !== "off";
}

function buildToolResult(params: DebugToolParams, config: DebugConfig) {
  if (!config.enabled) {
    return {
      content: [
        {
          type: "text" as const,
          text: "SuPi debug event capture is disabled. Enable Debug in /supi-settings to retain events.",
        },
      ],
      isError: true,
      details: { enabled: false },
    };
  }

  if (!toolAccessAllowed(config)) {
    return {
      content: [{ type: "text" as const, text: "Agent access to SuPi debug events is disabled." }],
      isError: true,
      details: { enabled: true, agentAccess: config.agentAccess },
    };
  }

  const query: DebugEventQuery = {
    source: params.source,
    level: params.level,
    category: params.category,
    limit: params.limit,
    includeRaw: params.includeRaw,
    allowRaw: config.agentAccess === "raw",
  };
  const result = getDebugEvents(query);
  const lines = formatEventLines(query);
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    details: {
      enabled: true,
      agentAccess: config.agentAccess,
      rawAccessDenied: result.rawAccessDenied,
      events: result.events,
    },
  };
}

/** Register the shared SuPi debug command, settings, context summary, and agent tool. */
export default function debugExtension(pi: ExtensionAPI) {
  applyDebugConfig(process.cwd());
  registerDebugSettings();
  registerDebugMessageRenderer(pi);

  registerContextProvider({
    id: "debug",
    label: "Debug",
    getData: buildSummaryData,
  });

  pi.on("session_start", async (_event, ctx) => {
    clearDebugEvents();
    applyDebugConfig(ctx.cwd);
    maybeLogLoadStatus(pi, ctx.cwd);
  });

  pi.registerCommand("supi-debug", {
    description: "Show recent SuPi debug events",
    handler: async (args, ctx) => {
      const config = applyDebugConfig(ctx.cwd);
      if (!config.enabled) {
        pi.sendMessage({
          customType: DEBUG_REPORT_TYPE,
          content: "SuPi debug event capture is disabled. Enable Debug in /supi-settings.",
          display: true,
        });
        return;
      }

      const query = parseCommandArgs(args);
      const { events, rawAccessDenied } = getDebugEvents(query);
      const lines = formatEvents(events, rawAccessDenied);
      pi.sendMessage({
        customType: DEBUG_REPORT_TYPE,
        content: lines.join("\n"),
        display: true,
        details: { events, rawAccessDenied },
      });
    },
  });

  pi.registerTool({
    name: "supi_debug",
    label: "SuPi Debug",
    description: "Fetch recent session-local SuPi extension debug events for troubleshooting.",
    promptSnippet:
      "Fetch recent SuPi extension debug events when troubleshooting extension behavior.",
    promptGuidelines: [
      "Use supi_debug when the user asks to inspect SuPi extension failures, fallback reasons, or recent debug events.",
      "supi_debug returns sanitized events by default; request raw data only when the user explicitly wants raw diagnostics and settings allow it.",
    ],
    parameters: Type.Object({
      source: Type.Optional(Type.String({ description: "Filter by extension source, e.g. rtk" })),
      level: Type.Optional(
        Type.Union([
          Type.Literal("debug"),
          Type.Literal("info"),
          Type.Literal("warning"),
          Type.Literal("error"),
        ]),
      ),
      category: Type.Optional(Type.String({ description: "Filter by event category" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of events to return" })),
      includeRaw: Type.Optional(
        Type.Boolean({ description: "Request raw event data when settings permit it" }),
      ),
    }),
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const config = applyDebugConfig(ctx.cwd);
      return buildToolResult(params as DebugToolParams, config);
    },
  });
}
