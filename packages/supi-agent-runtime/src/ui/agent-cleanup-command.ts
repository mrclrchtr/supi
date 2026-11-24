import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { runtimeState } from "../session/runtime-state.ts";
import {
  type AgentWorkspaceEntry,
  listAgentWorkspaces,
  removeAgentWorkspace,
} from "../workspace/inventory.ts";

/** Name of the shared recovery command for SuPi-marked worktrees. */
const AGENT_CLEANUP_COMMAND = "supi-agent-cleanup";
const CLEANUP_MESSAGE_TYPE = "supi-agent-cleanup";

/** What the command did with one SuPi-marked worktree. */
type CleanupOutcome = "removed" | "unlocked" | "kept" | "failed";

interface CleanupRow {
  path: string;
  owner?: string;
  outcome: CleanupOutcome;
  /** Why a worktree was kept or could not be cleaned up. */
  reason?: string;
}

/** TUI details for one cleanup report; `content` keeps the same facts as Markdown. */
interface CleanupMessageDetails {
  rows: CleanupRow[];
}

function ownerLabel(entry: AgentWorkspaceEntry): string {
  return `${entry.owner ?? "unknown owner"}${entry.legacy ? " (legacy marker)" : ""}`;
}

function keptRow(entry: AgentWorkspaceEntry): CleanupRow {
  return {
    path: entry.path,
    ...(entry.owner ? { owner: entry.owner } : {}),
    outcome: "kept",
    reason:
      entry.ownerStatus === "active" ? "owner is active" : "owner status cannot be determined",
  };
}

function describeCandidates(candidates: AgentWorkspaceEntry[], kept: number): string {
  const lines = candidates.map((entry) =>
    entry.disposable
      ? `Remove disposable workspace ${entry.path} [${ownerLabel(entry)}, owner absent]`
      : `Unlock and keep ${entry.path} [${ownerLabel(entry)}, owner absent]`,
  );
  if (kept > 0) lines.push(`Keep ${kept} worktree(s) whose owner is active or unknown.`);
  return lines.join("\n");
}

/** Re-read the inventory so a worktree that changed owner since listing is never touched. */
async function cleanUp(cwd: string, candidates: AgentWorkspaceEntry[]): Promise<CleanupRow[]> {
  const current = await listAgentWorkspaces(cwd);
  const rows: CleanupRow[] = [];
  for (const candidate of candidates) {
    const owner = candidate.owner ? { owner: candidate.owner } : {};
    const fresh = current.find((entry) => entry.path === candidate.path);
    if (!fresh || fresh.lockReason !== candidate.lockReason) {
      rows.push({ path: candidate.path, ...owner, outcome: "kept", reason: "marker changed" });
      continue;
    }
    if (fresh.ownerStatus !== "absent") {
      rows.push(keptRow(fresh));
      continue;
    }
    const removal = await removeAgentWorkspace(cwd, candidate.path);
    rows.push(
      removal.outcome === "failed"
        ? {
            path: candidate.path,
            ...owner,
            outcome: "failed",
            reason:
              removal.reason === "not-marked" ? "no longer SuPi-marked" : gitFailedHint(fresh),
          }
        : { path: candidate.path, ...owner, outcome: removal.outcome },
    );
  }
  return rows;
}

/** Manual recovery for a failed cleanup; a caller-provided worktree is never removed. */
function gitFailedHint(entry: AgentWorkspaceEntry): string {
  return entry.disposable
    ? `Git refused; run git worktree unlock ${entry.path} and git worktree remove --force ${entry.path} manually`
    : `Git refused; run git worktree unlock ${entry.path} manually`;
}

const OUTCOME_TEXT: Record<CleanupOutcome, string> = {
  removed: "Removed",
  unlocked: "Unlocked and kept",
  kept: "Left alone",
  failed: "Failed",
};

function formatReport(rows: CleanupRow[]): string {
  return [
    "# Agent Workspace Cleanup",
    "",
    ...rows.map(
      (row) => `- ${OUTCOME_TEXT[row.outcome]}: ${row.path}${row.reason ? ` — ${row.reason}` : ""}`,
    ),
  ].join("\n");
}

async function runCleanupCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) return;
  let entries: AgentWorkspaceEntry[];
  try {
    entries = await listAgentWorkspaces(ctx.cwd);
  } catch {
    ctx.ui.notify("Could not list SuPi-marked worktrees for this repository.", "error");
    return;
  }
  if (entries.length === 0) {
    ctx.ui.notify("No SuPi-marked worktrees need cleanup.", "info");
    return;
  }
  const candidates = entries.filter((entry) => entry.ownerStatus === "absent");
  const kept = entries.filter((entry) => entry.ownerStatus !== "absent").map(keptRow);
  let rows = kept;
  if (candidates.length > 0) {
    const approved = await ctx.ui.confirm(
      "Clean up SuPi-marked worktrees?",
      describeCandidates(candidates, kept.length),
    );
    if (!approved) return;
    rows = [...(await cleanUp(ctx.cwd, candidates)), ...kept];
  }
  pi.sendMessage({
    customType: CLEANUP_MESSAGE_TYPE,
    content: formatReport(rows),
    display: true,
    details: { rows } satisfies CleanupMessageDetails,
  });
}

function rowLine(row: CleanupRow, theme: Theme): string {
  const owner = row.owner ? theme.fg("dim", ` [${row.owner}]`) : "";
  const reason = row.reason ? theme.fg("warning", ` — ${row.reason}`) : "";
  switch (row.outcome) {
    case "removed":
      return `${theme.fg("success", "✓")} ${theme.fg("dim", row.path)}${owner}`;
    case "unlocked":
      return `${theme.fg("success", "✓")} ${row.path}${owner} ${theme.fg("dim", "unlocked and kept")}`;
    case "kept":
      return `${theme.fg("dim", "•")} ${row.path}${owner}${reason}`;
    case "failed":
      return `${theme.fg("error", "✗")} ${row.path}${owner}${reason}`;
  }
}

/** One status row per worktree; falls back to the stored text for reports without details. */
function renderAgentCleanupMessage(
  message: { content: unknown; details?: unknown },
  theme: Theme,
): Text {
  const rows = (message.details as Partial<CleanupMessageDetails> | undefined)?.rows;
  if (!rows) return new Text(typeof message.content === "string" ? message.content : "", 0, 0);
  const cleaned = rows.filter((row) => row.outcome === "removed" || row.outcome === "unlocked");
  const lines = [
    `${theme.fg("toolTitle", "Agent Workspace Cleanup")} ${theme.fg("dim", `· ${cleaned.length} of ${rows.length} cleaned up`)}`,
    ...rows.map((row) => rowLine(row, theme)),
  ];
  return new Text(lines.join("\n"), 0, 0);
}

/**
 * Register `/supi-agent-cleanup` once for a Pi runtime, like `/agents`. The command lists
 * SuPi-marked worktrees (`supi-agent:` and legacy `supi-review:` markers) with their owner status.
 * After confirmation, it removes disposable workspaces and only unlocks caller-provided worktrees
 * whose owner process is absent. Worktrees of an active or unknown owner are reported and left
 * alone.
 */
export function registerAgentCleanupCommand(pi: ExtensionAPI): void {
  const state = runtimeState(pi);
  if (state.cleanupCommandRegistered) return;
  pi.registerMessageRenderer(CLEANUP_MESSAGE_TYPE, (message, options, theme) => {
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(renderAgentCleanupMessage(message, theme));
    return box;
  });
  pi.registerCommand(AGENT_CLEANUP_COMMAND, {
    description: "Clean up SuPi-marked worktrees whose owner process has exited",
    handler: async (_args, ctx) => runCleanupCommand(pi, ctx),
  });
  state.cleanupCommandRegistered = true;
}
