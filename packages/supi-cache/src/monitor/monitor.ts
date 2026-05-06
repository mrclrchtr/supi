// supi-cache — continuous prompt cache health monitoring extension.
//
// Tracks per-turn cache metrics, detects regressions with cause diagnosis,
// shows a compact footer status, and provides /supi-cache-history and /supi-cache-forensics commands.

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { loadCacheMonitorConfig } from "../config.ts";
import { computePromptFingerprint, diffFingerprints, zeroFingerprint } from "../fingerprint.ts";
import { runForensics } from "../forensics/forensics.ts";
import { stripHumanDetail } from "../forensics/redact.ts";
import { formatForensicsReport } from "../report/forensics.ts";
import { type CacheReportSnapshot, formatCacheReport } from "../report/history.ts";
import { registerCacheMonitorSettings } from "../settings-registration.ts";
import { CacheMonitorState, type RegressionResult } from "./state.ts";
import { formatCacheStatus } from "./status.ts";

const STATUS_KEY = "supi-cache";
const ENTRY_TYPE = "supi-cache-turn";
const HISTORY_TYPE = "supi-cache-history";
const FORENSICS_TYPE = "supi-cache-forensics-report";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: extension factory wiring
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
      const diffs =
        regression.cause.type === "prompt_change"
          ? diffFingerprints(
              state.getPreviousFingerprint() ?? zeroFingerprint(),
              state.getLatestFingerprint() ?? zeroFingerprint(),
            )
          : undefined;
      ctx.ui.notify(formatRegressionMessage(regression, diffs), "warning");
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

  // ── before_agent_start: fingerprint system prompt ────────

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isEnabled(ctx)) return;
    const fp = computePromptFingerprint(event.systemPromptOptions);
    state.updatePromptFingerprint(fp);
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

  // ── /supi-cache-history command ──────────────────────────

  pi.registerCommand("supi-cache-history", {
    description: "Show per-turn cache health history",
    handler: async (_args, _ctx) => {
      const turns = state.getTurns();
      const shortContent = turns.length > 0 ? `${turns.length} turns tracked` : "No cache data yet";
      const snapshot: CacheReportSnapshot = {
        turns: [...turns],
        cacheSupported: state.cacheSupported,
      };

      pi.sendMessage({
        customType: HISTORY_TYPE,
        content: shortContent,
        display: true,
        details: snapshot,
      });
    },
  });

  // ── Message renderer for supi-cache-history ───────────────

  pi.registerMessageRenderer(HISTORY_TYPE, (message, _renderOptions, theme) => {
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

  // ── /supi-cache-forensics command ─────────────────────────

  pi.registerCommand("supi-cache-forensics", {
    description: "Cross-session cache forensics investigation",
    handler: async (args, ctx) => {
      const since = parseArg(args, "--since") ?? "7d";
      const pattern = (parseArg(args, "--pattern") ?? "breakdown") as
        | "hotspots"
        | "breakdown"
        | "correlate"
        | "idle";
      const minDrop = Number.parseInt(parseArg(args, "--min-drop") ?? "0", 10);
      const config = loadCacheMonitorConfig(ctx.cwd);

      const result = await runForensics({
        pattern,
        since,
        minDrop: Number.isNaN(minDrop) ? 0 : minDrop,
        idleThresholdMinutes: config.idleThresholdMinutes,
        regressionThreshold: config.regressionThreshold,
      });

      const shortContent = `${result.sessionsScanned} sessions, ${result.turnsAnalyzed} turns`;
      pi.sendMessage({
        customType: FORENSICS_TYPE,
        content: shortContent,
        display: true,
        details: result,
      });
    },
  });

  // ── Message renderer for supi-cache-forensics-report ──────

  pi.registerMessageRenderer(FORENSICS_TYPE, (message, _renderOptions, theme) => {
    const snapshot = message.details as
      | import("../report/forensics.ts").ForensicsReportSnapshot
      | undefined;
    const lines = formatForensicsReport(
      snapshot ?? {
        pattern: "breakdown",
        sessionsScanned: 0,
        turnsAnalyzed: 0,
      },
      theme,
    );
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

  // ── supi_cache_forensics agent tool ───────────────────────

  pi.registerTool({
    name: "supi_cache_forensics",
    label: "Cache Forensics",
    description:
      "Investigate prompt cache regressions across historical PI sessions. " +
      "Provides four query patterns: hotspots (worst drops), breakdown (cause tally), " +
      "correlate (tools before regressions), and idle (long-gap regressions). " +
      'Example: {"pattern": "hotspots", "since": "7d", "minDrop": 20}',
    parameters: Type.Object({
      pattern: StringEnum(["hotspots", "breakdown", "correlate", "idle"], {
        description: "Query pattern",
      }),
      since: Type.Optional(
        Type.String({
          description: 'Duration string like "7d", "24h", "30m". Default: "7d"',
          default: "7d",
        }),
      ),
      minDrop: Type.Optional(
        Type.Number({
          description: "Minimum hit-rate drop in percentage points to include. Default: 0",
          default: 0,
        }),
      ),
      maxSessions: Type.Optional(
        Type.Number({
          description: "Maximum sessions to scan. Default: 100",
          default: 100,
        }),
      ),
    }),
    promptGuidelines: [
      "Use `supi_cache_forensics` when the user asks about cache performance patterns, suspects idle-time cache expiry, or wants to understand what preceded a cache drop.",
      "Prefer `pattern: 'breakdown'` for a quick overview of regression causes.",
      "Use `pattern: 'hotspots'` with `minDrop: 20` or higher to surface the worst regressions.",
      "Use `pattern: 'idle'` to detect cache drops caused by long gaps between turns.",
      "Use `pattern: 'correlate'` to see which tool calls preceded regressions.",
      "The tool returns shape fingerprints (param types and lengths), not raw file paths or command text.",
    ],
    // biome-ignore lint/complexity/useMaxParams: pi tool execute signature
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const config = loadCacheMonitorConfig(ctx.cwd);
      const result = await runForensics({
        pattern: params.pattern as "hotspots" | "breakdown" | "correlate" | "idle",
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

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: undefined,
      };
    },
  });
}

/** Parse a simple `--key value` argument from a command string. */
function parseArg(args: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s+([^\\s]+)`);
  const match = args.match(regex);
  return match?.[1];
}

function formatRegressionMessage(regression: RegressionResult, diffs?: string[]): string {
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
      causeStr =
        diffs && diffs.length > 0
          ? `system prompt changed (${diffs.join(", ")})`
          : "system prompt changed";
      break;
    default:
      causeStr = "unknown";
  }

  return `Cache regression: ${previousRate}% → ${currentRate}%. Likely cause: ${causeStr}`;
}
