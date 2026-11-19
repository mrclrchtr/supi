import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { canPersistDebugEvent, recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { runSideRun } from "@mrclrchtr/supi-core/session";
import {
  TOOLING_RETRO_DESCRIPTION,
  TOOLING_RETRO_PROMPT,
  TOOLING_RETRO_PROMPT_REVISION,
} from "./prompt.ts";
import {
  registerToolingRetroRenderers,
  TOOLING_RETRO_PROMPT_TYPE,
  TOOLING_RETRO_REPORT_TYPE,
  type ToolingRetroReportData,
} from "./render.ts";

/** Slash command name; extension commands take precedence over prompt templates of this name. */
export const TOOLING_RETRO_COMMAND = "supi-tooling-retro";
/** Debug event category read by `gather-retrospectives` and `supi-insights`. */
export const TOOLING_RETRO_CATEGORY = "tooling-retrospective";
/** Custom entry (outside LLM context) that marks where the side branch starts. */
export const TOOLING_RETRO_ANCHOR_TYPE = "supi-tooling-retro-anchor";

const NOT_STORED_NOTICE =
  "Debug persistence is inactive, so this Tooling Retrospective will not be stored for gather-retrospectives. Enable Debug in /supi-settings to store future reports.";

interface AssistantReport {
  readonly entryId: string;
  readonly timestamp: number;
  readonly stopReason: unknown;
  readonly text: string;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * Find the final assistant message answering the retrospective prompt that
 * follows `anchorId` on the branch. Answers after a later user message (a steer
 * or follow-up) are not part of the report.
 */
export function findRetroReport(
  branch: readonly SessionEntry[],
  anchorId: string,
): AssistantReport | undefined {
  const start = branch.findIndex((entry) => entry.id === anchorId);
  if (start < 0) return undefined;
  let promptSeen = false;
  let report: AssistantReport | undefined;
  for (const entry of branch.slice(start + 1)) {
    if (entry.type === "custom_message" && entry.customType === TOOLING_RETRO_PROMPT_TYPE) {
      promptSeen = true;
      continue;
    }
    if (entry.type !== "message" || !promptSeen) continue;
    const message = entry.message as { role?: string; content?: unknown; stopReason?: unknown };
    if (message.role === "user") break;
    if (message.role === "assistant") {
      report = {
        entryId: entry.id,
        timestamp: Date.parse(entry.timestamp),
        stopReason: message.stopReason,
        text: textOf(message.content),
      };
    }
  }
  return report;
}

function recordReport(report: AssistantReport, cwd: string): void {
  recordDebugEvent({
    source: "supi-debug",
    cwd,
    category: TOOLING_RETRO_CATEGORY,
    level: "info",
    message: "Tooling retrospective",
    data: {
      // Entry id and timestamp survive forks, which copy entries into a new session file.
      runKey: `${report.entryId}:${report.timestamp}`,
      status: "completed",
      promptRevision: TOOLING_RETRO_PROMPT_REVISION,
      text: report.text,
    },
  });
}

/**
 * Run the retrospective on a side branch and return to the anchor, so the next
 * task continues without the retrospective prompt or answer in its context.
 */
async function runToolingRetro(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  // The report assesses the preceding task, so let that task finish first.
  if (!ctx.isIdle()) ctx.ui.notify("Waiting for the agent to become idle.", "info");
  await ctx.waitForIdle();
  const storing = canPersistDebugEvent("info");
  if (!storing) ctx.ui.notify(NOT_STORED_NOTICE, "warning");

  // A custom entry as anchor: navigating to it keeps the editor empty and adds no context.
  pi.appendEntry(TOOLING_RETRO_ANCHOR_TYPE, { promptRevision: TOOLING_RETRO_PROMPT_REVISION });
  const anchorId = ctx.sessionManager.getLeafId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!anchorId) return;

  // The side-run signal spans the run and the return to the anchor, so listeners such as
  // prompt suggestions skip the abandoned report on `agent_settled`.
  const result = await runSideRun(pi, "supi-debug", async () => {
    pi.sendMessage(
      { customType: TOOLING_RETRO_PROMPT_TYPE, content: TOOLING_RETRO_PROMPT, display: true },
      { triggerTurn: true },
    );
    // Pi marks the triggered run active synchronously, so this waits for the whole run,
    // including retries; if the run could not start, it returns at once without a report.
    await ctx.waitForIdle();
    // A session switch during the run leaves nothing to restore here.
    if (ctx.sessionManager.getSessionFile() !== sessionFile) return undefined;

    const found = findRetroReport(ctx.sessionManager.getBranch(), anchorId);
    await ctx.navigateTree(anchorId, { summarize: false });
    return { report: found };
  });
  if (!result) return;
  const { report } = result;

  if (report?.stopReason !== "stop" || !report.text.trim()) {
    ctx.ui.notify("Tooling Retrospective did not complete; nothing was stored.", "warning");
    return;
  }
  const stored = canPersistDebugEvent("info");
  pi.appendEntry<ToolingRetroReportData>(TOOLING_RETRO_REPORT_TYPE, {
    text: report.text,
    stored,
  });
  // The report header already says whether it was stored. An info notice would also be
  // copied into Pi's "Navigated to selected point" status line, which shares its text.
  if (stored) recordReport(report, ctx.cwd);
  else if (storing) {
    // Repeat the notice only when persistence stopped during the run.
    ctx.ui.notify(NOT_STORED_NOTICE, "warning");
  }
}

/**
 * Register `/supi-tooling-retro`. It runs the retrospective prompt on a side
 * branch, returns to the branch point, shows the report outside LLM context, and,
 * when the answer ends normally and Debug persistence is active, records it as a
 * `tooling-retrospective` Debug event. Aborted, failed, or truncated answers are
 * not recorded. Without active persistence the command still runs and says so.
 */
export function registerToolingRetroCommand(pi: ExtensionAPI): void {
  registerToolingRetroRenderers(pi);
  pi.registerCommand(TOOLING_RETRO_COMMAND, {
    description: TOOLING_RETRO_DESCRIPTION,
    handler: (_args, ctx) => runToolingRetro(pi, ctx),
  });
}
