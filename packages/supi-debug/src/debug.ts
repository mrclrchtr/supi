import { StringEnum } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  type TruncationResult,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { registerContextProvider } from "@mrclrchtr/supi-core/context";
import {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  type DebugAgentAccess,
  type DebugEventQuery,
  type DebugEventView,
  type DebugLevel,
  getDebugEvents,
  getDebugSummary,
} from "@mrclrchtr/supi-core/debug";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";
import { Type } from "typebox";
import { formatDataLines } from "./format.ts";
import { registerDebugMessageRenderer } from "./renderer.ts";
import { maybeLogLoadStatus } from "./status-log.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";

const DEBUG_SECTION = "debug";
const DEBUG_REPORT_TYPE = "supi-debug-report";

interface DebugConfig extends Record<string, unknown> {
  enabled: boolean;
  agentAccess: DebugAgentAccess;
  maxEvents: number;
}

const DEBUG_DEFAULTS: DebugConfig = { ...DEBUG_REGISTRY_DEFAULTS };

type DebugToolParams = DebugEventQuery;

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
  registerDeclarativeSettings(pi, {
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

function appendTruncationNote(content: string, truncation: TruncationResult): string {
  if (!truncation.truncated) return content;

  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  const separator = content.length > 0 ? "\n\n" : "";
  return `${content}${separator}[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ${omittedLines} lines (${formatSize(omittedBytes)}) omitted. Use filters or a smaller limit to narrow results.]`;
}

function truncateDebugOutput(content: string): { text: string; truncation?: TruncationResult } {
  const truncation = truncateHead(content, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  return {
    text: appendTruncationNote(truncation.content, truncation),
    truncation: truncation.truncated ? truncation : undefined,
  };
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
    throw new Error(
      "SuPi debug event capture is disabled. Enable Debug in /supi-settings to retain events.",
    );
  }

  if (!toolAccessAllowed(config)) {
    throw new Error("Agent access to SuPi debug events is disabled.");
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
  const output = truncateDebugOutput(
    formatEvents(result.events, result.rawAccessDenied).join("\n"),
  );
  return {
    content: [{ type: "text" as const, text: output.text }],
    details: {
      enabled: true,
      agentAccess: config.agentAccess,
      rawAccessDenied: result.rawAccessDenied,
      events: result.events,
      truncation: output.truncation,
    },
  };
}

/** Register the shared SuPi debug command, settings, context summary, and agent tool. */
export default function debugExtension(pi: ExtensionAPI) {
  applyDebugConfig(process.cwd());
  registerDebugSettings(pi);
  registerDebugMessageRenderer(pi);

  registerContextProvider({
    id: "debug",
    label: "Debug",
    getData: buildSummaryData,
  });

  pi.on("session_start", async (_event, ctx) => {
    clearDebugEvents();
    applyDebugConfig(ctx.cwd);
  });

  // Commands registered during every extension's session_start handler are
  // available before resource discovery, so this inventory is load-order safe.
  pi.on("resources_discover", async (_event, ctx) => {
    maybeLogLoadStatus(pi, ctx.cwd, "resources_discover");
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
      const output = truncateDebugOutput(formatEvents(events, rawAccessDenied).join("\n"));
      pi.sendMessage({
        customType: DEBUG_REPORT_TYPE,
        content: output.text,
        display: true,
        details: { events, rawAccessDenied, truncation: output.truncation },
      });
    },
  });

  pi.registerTool({
    name: "supi_debug",
    label: "SuPi Debug",
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    parameters: Type.Object({
      source: Type.Optional(Type.String({ description: "Filter by extension source, e.g. lsp" })),
      level: Type.Optional(
        StringEnum(["debug", "info", "warning", "error"], {
          description: "Filter by debug level",
        }),
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
