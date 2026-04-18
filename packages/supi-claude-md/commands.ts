// Command handlers for /supi-claude-md.
//
// Extracted from index.ts to keep the extension entry point focused on event wiring.

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { removeSupiConfigKey, writeSupiConfig } from "@mrclrchtr/supi-core";
import { loadClaudeMdConfig } from "./config.ts";
import type { ClaudeMdState } from "./state.ts";

const SUBCOMMANDS = ["status", "refresh", "list", "interval", "subdirs", "compact"] as const;

export function getSubcommandHelp(subcommand: string): string {
  switch (subcommand) {
    case "status":
      return "Show effective config and current state";
    case "refresh":
      return "Force root context refresh on next prompt";
    case "list":
      return "Show discovered subdirectory context files";
    case "interval":
      return "Set reread interval (N, off, default)";
    case "subdirs":
      return "Toggle subdirectory discovery (on/off)";
    case "compact":
      return "Toggle post-compaction refresh (on/off)";
    default:
      return "";
  }
}

export function getArgumentCompletions(argumentPrefix: string) {
  const filtered = SUBCOMMANDS.filter((s) => s.startsWith(argumentPrefix));
  if (filtered.length === 0) return null;
  return filtered.map((s) => ({
    value: s,
    label: s,
    description: getSubcommandHelp(s),
  }));
}

export function handleCommand(
  args: string,
  ctx: ExtensionContext,
  state: ClaudeMdState | null,
): void {
  const parts = args.trim().split(/\s+/);
  const globalFlag = parts.includes("--global");
  const nonFlagParts = parts.filter((p) => p !== "--global" && p !== "");
  const subcommand = nonFlagParts[0] ?? "status";
  const scope: "global" | "project" = globalFlag ? "global" : "project";

  switch (subcommand) {
    case "status":
      handleStatus(ctx, state);
      break;
    case "refresh":
      handleRefresh(ctx, state);
      break;
    case "list":
      handleList(ctx);
      break;
    case "interval":
      handleInterval(nonFlagParts[1], scope, ctx);
      break;
    case "subdirs":
      handleToggle("subdirs", nonFlagParts[1], scope, ctx);
      break;
    case "compact":
      handleToggle("compactRefresh", nonFlagParts[1], scope, ctx);
      break;
    default:
      ctx.ui.notify(`Unknown subcommand: ${subcommand}`, "warning");
  }
}

function handleStatus(ctx: ExtensionContext, state: ClaudeMdState | null): void {
  const config = loadClaudeMdConfig(ctx.cwd);
  const lines = [
    "**supi-claude-md status**",
    `  rereadInterval: ${config.rereadInterval}`,
    `  subdirs: ${config.subdirs}`,
    `  compactRefresh: ${config.compactRefresh}`,
    `  fileNames: ${config.fileNames.join(", ")}`,
    `  completedTurns: ${state?.completedTurns ?? "N/A"}`,
    `  lastRefreshTurn: ${state?.lastRefreshTurn ?? "N/A"}`,
    `  injectedDirs: ${state?.injectedDirs.size ?? 0}`,
    `  needsRefresh: ${state?.needsRefresh ?? "N/A"}`,
  ];
  ctx.ui.notify(lines.join("\n"), "info");
}

function handleRefresh(ctx: ExtensionContext, state: ClaudeMdState | null): void {
  if (state) {
    state.needsRefresh = true;
  }
  ctx.ui.notify("Root context will be refreshed on the next prompt.", "info");
}

function handleList(ctx: ExtensionContext): void {
  const config = loadClaudeMdConfig(ctx.cwd);
  const files: string[] = [];
  scanForContextFiles(ctx.cwd, ctx.cwd, config.fileNames, files);
  if (files.length === 0) {
    ctx.ui.notify("No subdirectory context files found.", "info");
  } else {
    ctx.ui.notify(
      `**Subdirectory context files:**\n${files.map((f) => `  - ${f}`).join("\n")}`,
      "info",
    );
  }
}

function handleInterval(
  value: string | undefined,
  scope: "global" | "project",
  ctx: ExtensionContext,
): void {
  if (!value) {
    ctx.ui.notify("Usage: /supi-claude-md interval <N|off|default>", "warning");
    return;
  }

  if (value === "default") {
    removeSupiConfigKey({ section: "claude-md", scope, cwd: ctx.cwd }, "rereadInterval");
    ctx.ui.notify(`rereadInterval reset to default (scope: ${scope})`, "info");
    return;
  }

  if (value === "off") {
    writeSupiConfig({ section: "claude-md", scope, cwd: ctx.cwd }, { rereadInterval: 0 });
    ctx.ui.notify(`rereadInterval set to off (scope: ${scope})`, "info");
    return;
  }

  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    ctx.ui.notify("Invalid interval. Use a positive number, 'off', or 'default'.", "warning");
    return;
  }

  writeSupiConfig({ section: "claude-md", scope, cwd: ctx.cwd }, { rereadInterval: n });
  ctx.ui.notify(`rereadInterval set to ${n} (scope: ${scope})`, "info");
}

function handleToggle(
  key: "subdirs" | "compactRefresh",
  value: string | undefined,
  scope: "global" | "project",
  ctx: ExtensionContext,
): void {
  if (!value || (value !== "on" && value !== "off")) {
    const name = key === "subdirs" ? "subdirs" : "compact";
    ctx.ui.notify(`Usage: /supi-claude-md ${name} <on|off>`, "warning");
    return;
  }

  writeSupiConfig({ section: "claude-md", scope, cwd: ctx.cwd }, { [key]: value === "on" });
  ctx.ui.notify(`${key} set to ${value === "on"} (scope: ${scope})`, "info");
}

function scanForContextFiles(
  baseDir: string,
  cwd: string,
  fileNames: string[],
  results: string[],
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const subDir = path.join(baseDir, entry.name);
      for (const fileName of fileNames) {
        const candidate = path.join(subDir, fileName);
        try {
          if (fs.existsSync(candidate)) {
            results.push(path.relative(cwd, candidate));
          }
        } catch {
          // skip
        }
      }
      scanForContextFiles(subDir, cwd, fileNames, results);
    }
  } catch {
    // skip unreadable dirs
  }
}
