// Cache history and cross-session forensics extension.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { loadCacheForensicsConfig } from "../config.ts";
import { type ForensicsReportSnapshot, formatForensicsReport } from "../report/forensics.ts";
import { type CacheReportSnapshot, formatCacheReport } from "../report/history.ts";
import { registerCacheForensicsSettings } from "../settings-registration.ts";
import { registerCacheForensicsTool } from "../tool/cache_forensics/register.ts";
import { extractCacheTurnEntries } from "./extract.ts";
import { runForensics } from "./forensics.ts";
import { DEFAULT_FINDINGS_LIMIT, type ForensicsOptions, normalizeFindingsLimit } from "./types.ts";

const HISTORY_TYPE = "supi-cache-history";
const FORENSICS_TYPE = "supi-cache-forensics-report";
const DEFAULT_PATTERN: ForensicsOptions["pattern"] = "breakdown";
const PATTERNS = new Set<ForensicsOptions["pattern"]>([
  "hotspots",
  "breakdown",
  "correlate",
  "idle",
]);

/** Register cache history and historical forensics surfaces. */
export default function cacheForensicsExtension(pi: ExtensionAPI): void {
  registerCacheForensicsSettings(pi);

  pi.registerCommand("supi-cache-history", {
    description: "Show per-turn cache usage history",
    handler: async (_args, ctx) => {
      const turns = extractCacheTurnEntries(ctx.sessionManager.getBranch());
      const snapshot: CacheReportSnapshot = {
        turns: [...turns],
      };

      pi.sendMessage({
        customType: HISTORY_TYPE,
        content: turns.length > 0 ? `${turns.length} turns found` : "No cache data yet",
        display: true,
        details: snapshot,
      });
    },
  });

  pi.registerMessageRenderer(HISTORY_TYPE, (message, _renderOptions, theme) => {
    const snapshot = message.details as CacheReportSnapshot | undefined;
    const lines = formatCacheReport(snapshot ?? { turns: [] }, theme);
    return linesToContainer(lines);
  });

  pi.registerCommand("supi-cache-forensics", {
    description: "Investigate cache regressions across past PI sessions",
    handler: async (args, ctx) => {
      const config = loadCacheForensicsConfig(ctx.cwd);
      const query = {
        pattern: parsePattern(parseArg(args, "--pattern")),
        since: parseArg(args, "--since") ?? "7d",
        minDrop: parseNumberArg(args, "--min-drop", 0),
        maxFindings: normalizeFindingsLimit(
          parseNumberArg(args, "--limit", DEFAULT_FINDINGS_LIMIT),
        ),
      };
      const result = await runForensics({
        ...query,
        idleThresholdMinutes: config.idleThresholdMinutes,
        regressionThreshold: config.regressionThreshold,
      });

      pi.sendMessage({
        customType: FORENSICS_TYPE,
        content: `${result.sessionsScanned} sessions, ${result.turnsAnalyzed} turns`,
        display: true,
        details: result,
      });
    },
  });

  pi.registerMessageRenderer(FORENSICS_TYPE, (message, _renderOptions, theme) => {
    const snapshot = message.details as ForensicsReportSnapshot | undefined;
    const lines = formatForensicsReport(
      snapshot ?? {
        pattern: DEFAULT_PATTERN,
        sessionsScanned: 0,
        turnsAnalyzed: 0,
      },
      theme,
    );
    return linesToContainer(lines);
  });

  registerCacheForensicsTool(pi);
}

function linesToContainer(lines: string[]): Container {
  const container = new Container();
  for (const line of lines) {
    container.addChild(line === "" ? new Spacer(1) : new Text(line, 0, 0));
  }
  return container;
}

function parsePattern(value: string | undefined): ForensicsOptions["pattern"] {
  return value && PATTERNS.has(value as ForensicsOptions["pattern"])
    ? (value as ForensicsOptions["pattern"])
    : DEFAULT_PATTERN;
}

function parseNumberArg(args: string, key: string, fallback: number): number {
  const value = parseArg(args, key);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Parse a simple `--key value` argument from a command string. */
function parseArg(args: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s+([^\\s]+)`);
  return args.match(regex)?.[1];
}
