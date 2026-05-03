// supi-cache-monitor — continuous prompt cache health monitoring extension.
//
// Tracks per-turn cache metrics, detects regressions with cause diagnosis,
// shows a compact footer status, and provides a /supi-cache history command.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { loadCacheMonitorConfig } from "./config.ts";
import { fastHash } from "./hash.ts";
import { type CacheReportSnapshot, formatCacheReport } from "./report.ts";
import { registerCacheMonitorSettings } from "./settings-registration.ts";
import { CacheMonitorState, type RegressionResult } from "./state.ts";
import { formatCacheStatus } from "./status.ts";

const STATUS_KEY = "supi-cache";
const ENTRY_TYPE = "supi-cache-turn";
const REPORT_TYPE = "supi-cache-report";

export default function cacheMonitorExtension(pi: ExtensionAPI) {
  const state = new CacheMonitorState();

  // Register settings synchronously during factory
  registerCacheMonitorSettings();

  // ── Helper: check if extension is enabled ─────────────────

  function isEnabled(ctx: { cwd: string }): boolean {
    return loadCacheMonitorConfig(ctx.cwd).enabled;
  }

  function notificationsEnabled(ctx: { cwd: string }): boolean {
    return loadCacheMonitorConfig(ctx.cwd).notifications;
  }

  function getThreshold(ctx: { cwd: string }): number {
    return loadCacheMonitorConfig(ctx.cwd).regressionThreshold;
  }

  // ── message_end: record turn + update status + check regression

  pi.on("message_end", async (event, ctx) => {
    if (!isEnabled(ctx)) return;

    const msg = event.message;
    if (msg.role !== "assistant") return;
    if (!("usage" in msg) || !msg.usage) return;

    const { cacheRead, cacheWrite, input } = msg.usage;
    const record = state.recordTurn({ cacheRead, cacheWrite, input }, Date.now());

    // Persist turn record
    pi.appendEntry(ENTRY_TYPE, record);

    // Update footer status
    const statusText = formatCacheStatus(state);
    ctx.ui.setStatus(STATUS_KEY, statusText);

    // Check regression
    const regression = state.detectRegression(getThreshold(ctx));
    if (regression && notificationsEnabled(ctx)) {
      ctx.ui.notify(formatRegressionMessage(regression), "warning");
    }
  });

  // ── session_compact: flag compaction ──────────────────────

  pi.on("session_compact", async (_event, ctx) => {
    if (!isEnabled(ctx)) return;
    state.flagCompaction();
  });

  // ── model_select: flag model change ───────────────────────

  pi.on("model_select", async (event, ctx) => {
    if (!isEnabled(ctx)) return;
    const modelStr = `${event.model.provider}/${event.model.id}`;
    state.flagModelChange(modelStr);
  });

  // ── before_agent_start: hash system prompt ────────────────

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isEnabled(ctx)) return;
    const hash = fastHash(event.systemPrompt);
    state.updatePromptHash(hash);
  });

  // ── session_start: restore state from entries ─────────────

  pi.on("session_start", async (_event, ctx) => {
    state.reset();

    if (!isEnabled(ctx)) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const branch = ctx.sessionManager.getBranch();
    state.restoreFromEntries(branch);

    const statusText = formatCacheStatus(state);
    ctx.ui.setStatus(STATUS_KEY, statusText);
  });

  // ── session_shutdown: clear state ─────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    state.reset();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  // ── /supi-cache command ───────────────────────────────────

  pi.registerCommand("supi-cache", {
    description: "Show per-turn cache health history",
    handler: async (_args, _ctx) => {
      const turns = state.getTurns();
      const shortContent = turns.length > 0 ? `${turns.length} turns tracked` : "No cache data yet";
      const snapshot: CacheReportSnapshot = {
        turns: [...turns],
        cacheSupported: state.cacheSupported,
      };

      pi.sendMessage({
        customType: REPORT_TYPE,
        content: shortContent,
        display: true,
        details: snapshot,
      });
    },
  });

  // ── Message renderer for supi-cache-report ────────────────

  pi.registerMessageRenderer(REPORT_TYPE, (message, _renderOptions, theme) => {
    const snapshot = message.details as CacheReportSnapshot | undefined;
    const lines = formatCacheReport(snapshot ?? { turns: [], cacheSupported: false }, theme);
    const container = new Container();

    for (const line of lines) {
      if (line === "") {
        container.addChild(new Spacer(1));
      } else {
        container.addChild(new Text(line, 0, 0));
      }
    }

    return container;
  });
}

function formatRegressionMessage(regression: RegressionResult): string {
  if (!regression) return "";
  const { previousRate, currentRate, cause } = regression;
  let causeStr: string;

  switch (cause.type) {
    case "compaction":
      causeStr = "compaction";
      break;
    case "model_change":
      causeStr = `model changed${cause.model !== "unknown" ? ` to ${cause.model}` : ""}`;
      break;
    case "prompt_change":
      causeStr = "system prompt changed";
      break;
    default:
      causeStr = "unknown";
  }

  return `Cache regression: ${previousRate}% → ${currentRate}%. Likely cause: ${causeStr}`;
}
