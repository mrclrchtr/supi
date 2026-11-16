import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { ReviewWorkspaceCleanupPicker } from "../ui/review-workspace-cleanup-picker.ts";
import type { ReviewWorkspaceCleanupCandidate } from "./review-workspace-cleanup.ts";
import { listReviewWorkspaces, removeReviewWorkspace } from "./review-workspace-cleanup.ts";

const CLEANUP_MESSAGE_TYPE = "supi-review-cleanup";

/** TUI details for one cleanup report; `content` keeps the same facts as Markdown. */
interface CleanupMessageDetails {
  results: { workspacePath: string; removed: boolean; message?: string }[];
}

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

async function chooseWorkspaces(ctx: CommandContext) {
  const candidates = await listReviewWorkspaces(ctx.cwd);
  if (candidates.length === 0) return { candidates, selected: undefined };
  const selected = await ctx.ui.custom<string[] | null>(
    (tui, theme, _keybindings, done) =>
      new ReviewWorkspaceCleanupPicker(candidates, theme, () => tui.requestRender(), done),
  );
  return { candidates, selected };
}

async function confirmSelection(
  ctx: CommandContext,
  choice: Awaited<ReturnType<typeof chooseWorkspaces>>,
): Promise<ReviewWorkspaceCleanupCandidate[] | undefined> {
  if (choice.candidates.length === 0) {
    ctx.ui.notify("No marked Review Workspaces need cleanup.", "info");
    return undefined;
  }
  if (!choice.selected || choice.selected.length === 0) return undefined;
  const selected = choice.candidates.filter((candidate) =>
    choice.selected?.includes(candidate.workspacePath),
  );
  const approved = await ctx.ui.confirm(
    "Remove Review Workspaces?",
    `Remove ${selected.length} selected disposable worktree(s)?`,
  );
  if (!approved) return undefined;
  if (!selected.some((candidate) => candidate.owner === "active")) return selected;
  return (await ctx.ui.confirm(
    "Active review owner detected",
    "At least one selected workspace appears active. Remove anyway?",
  ))
    ? selected
    : undefined;
}

function formatCleanupResults(
  results: Awaited<ReturnType<typeof removeReviewWorkspace>>[],
): string {
  return [
    "# Review Workspace Cleanup",
    "",
    ...results.map((result) =>
      result.removed
        ? `- Removed: ${result.workspacePath}`
        : `- Failed: ${result.workspacePath} — ${result.message}`,
    ),
  ].join("\n");
}

async function runCleanupCommand(pi: ExtensionAPI, ctx: CommandContext): Promise<void> {
  if (!ctx.hasUI) return;
  let choice: Awaited<ReturnType<typeof chooseWorkspaces>>;
  try {
    choice = await chooseWorkspaces(ctx);
  } catch {
    ctx.ui.notify("Could not list Review Workspaces for this repository.", "error");
    return;
  }
  const selected = await confirmSelection(ctx, choice);
  if (!selected) return;

  const results = [];
  for (const candidate of selected) results.push(await removeReviewWorkspace(ctx.cwd, candidate));
  pi.sendMessage({
    customType: CLEANUP_MESSAGE_TYPE,
    content: formatCleanupResults(results),
    display: true,
    details: {
      results: results.map((result) =>
        result.removed
          ? { workspacePath: result.workspacePath, removed: true }
          : { workspacePath: result.workspacePath, removed: false, message: result.message },
      ),
    } satisfies CleanupMessageDetails,
  });
}

/** One status row per workspace; falls back to the stored text for reports without details. */
export function renderCleanupMessage(
  message: { content: unknown; details?: unknown },
  theme: Theme,
): Text {
  const results = (message.details as Partial<CleanupMessageDetails> | undefined)?.results;
  if (!results) {
    return new Text(typeof message.content === "string" ? message.content : "", 0, 0);
  }
  const removed = results.filter((result) => result.removed).length;
  const lines = [
    `${theme.fg("toolTitle", "Review Workspace Cleanup")} ${theme.fg("dim", `· ${removed} of ${results.length} removed`)}`,
    ...results.map((result) =>
      result.removed
        ? `${theme.fg("success", "✓")} ${theme.fg("dim", result.workspacePath)}`
        : `${theme.fg("error", "✗")} ${result.workspacePath} ${theme.fg("warning", `— ${result.message ?? "failed"}`)}`,
    ),
  ];
  return new Text(lines.join("\n"), 0, 0);
}

/** Register explicit recovery for marked Review Workspaces left by interruption or failed cleanup. */
export function registerReviewWorkspaceCleanupCommand(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(CLEANUP_MESSAGE_TYPE, (message, options, theme) => {
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(renderCleanupMessage(message, theme));
    return box;
  });
  pi.registerCommand("supi-review-cleanup", {
    description: "Select and remove marked Review Workspaces left by interrupted reviews",
    handler: async (_args, ctx) => runCleanupCommand(pi, ctx),
  });
}
