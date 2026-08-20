import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerContextProvider } from "@mrclrchtr/supi-core/context";
import {
  clearDebugEvents,
  getDebugSummary,
  subscribeDebugEvents,
} from "@mrclrchtr/supi-core/debug";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";
import { registerDebugCommand } from "./command.ts";
import {
  applyDebugConfig,
  DEBUG_DEFAULTS,
  DEBUG_SECTION,
  normalizeMaxEvents,
  syncLiveDebugRegistry,
} from "./config.ts";
import { registerDebugMessageRenderer } from "./renderer.ts";
import { DEBUG_EVENT_ENTRY_TYPE } from "./session-events.ts";
import { maybeLogLoadStatus } from "./status-log.ts";
import { registerDebugTool } from "./tool/debug/register.ts";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

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
    // Self-register the package prompt template so standalone installs and
    // workspace-root loads expose the same `/supi-tooling-retro` surface.
    return { promptPaths: [join(baseDir, "prompts")] };
  });

  pi.on("session_shutdown", () => {
    unsubscribeDebugEvents();
  });

  registerDebugCommand(pi, applyDebugConfig, normalizeMaxEvents);
  registerDebugTool(pi);
}
