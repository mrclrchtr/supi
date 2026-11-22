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
 * follows `startId` on the branch (`null` scans from the branch start). Answers
 * after a later user message (a steer or follow-up) are not part of the report.
 */
export function findRetroReport(
  branch: readonly SessionEntry[],
  startId: string | null,
): AssistantReport | undefined {
  const start = startId === null ? -1 : branch.findIndex((entry) => entry.id === startId);
  if (startId !== null && start < 0) return undefined;
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
 * Outcome of a retrospective run: `undefined` when there is nothing to report on,
 * because the session switched or no anchor exists; otherwise the report, if any.
 */
type RetroRun = { report: AssistantReport | undefined } | undefined;

/** Where the retrospective runs; chosen per run before it starts. */
type Placement = "side-branch" | "main-path";

const PLACEMENT_TITLE = "Where should the Tooling Retrospective run?";
const PLACEMENT_LABELS: Record<Placement, string> = {
  "side-branch": "Side branch — return afterwards; the report stays out of context",
  "main-path": "Main path — the prompt and report stay in context",
};

/**
 * Ask where the retrospective runs. The side branch is listed first, so Enter keeps it.
 * Without dialog support it is used silently; a dismissed dialog cancels the command.
 */
async function choosePlacement(ctx: ExtensionCommandContext): Promise<Placement | undefined> {
  if (!ctx.hasUI) return "side-branch";
  const choice = await ctx.ui.select(PLACEMENT_TITLE, Object.values(PLACEMENT_LABELS));
  return (Object.keys(PLACEMENT_LABELS) as Placement[]).find(
    (placement) => PLACEMENT_LABELS[placement] === choice,
  );
}

/**
 * Send the retrospective prompt and wait for its run. Returns the report following
 * `startId`, or `undefined` when the session switched during the run.
 */
async function runRetroPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  startId: string | null,
  sessionFile: string | undefined,
): Promise<RetroRun> {
  pi.sendMessage(
    { customType: TOOLING_RETRO_PROMPT_TYPE, content: TOOLING_RETRO_PROMPT, display: true },
    { triggerTurn: true },
  );
  // Pi marks the triggered run active synchronously, so this waits for the whole run,
  // including retries; if the run could not start, it returns at once without a report.
  await ctx.waitForIdle();
  // A session switch during the run leaves nothing to report or restore here.
  if (ctx.sessionManager.getSessionFile() !== sessionFile) return undefined;
  return { report: findRetroReport(ctx.sessionManager.getBranch(), startId) };
}

/**
 * Run the retrospective on a side branch and return to the anchor, so the next
 * task continues without the retrospective prompt or answer in its context.
 */
async function runOnSideBranch(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<RetroRun> {
  // A custom entry as anchor: navigating to it keeps the editor empty and adds no context.
  pi.appendEntry(TOOLING_RETRO_ANCHOR_TYPE, { promptRevision: TOOLING_RETRO_PROMPT_REVISION });
  const anchorId = ctx.sessionManager.getLeafId();
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!anchorId) return undefined;

  // The side-run signal spans the run and the return to the anchor, so listeners such as
  // prompt suggestions skip the abandoned report on `agent_settled`.
  return runSideRun(pi, "supi-debug", async () => {
    const result = await runRetroPrompt(pi, ctx, anchorId, sessionFile);
    if (result) await ctx.navigateTree(anchorId, { summarize: false });
    return result;
  });
}

/**
 * Run the retrospective as a normal turn on the main path, so the prompt and report
 * stay in context and follow-up prompts can build on the report.
 */
function runOnMainPath(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<RetroRun> {
  return runRetroPrompt(
    pi,
    ctx,
    ctx.sessionManager.getLeafId(),
    ctx.sessionManager.getSessionFile(),
  );
}

async function runToolingRetro(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const placement = await choosePlacement(ctx);
  if (!placement) return;
  // The report assesses the preceding task, so let that task finish first.
  if (!ctx.isIdle()) ctx.ui.notify("Waiting for the agent to become idle.", "info");
  await ctx.waitForIdle();
  const storing = canPersistDebugEvent("info");
  if (!storing) ctx.ui.notify(NOT_STORED_NOTICE, "warning");

  const result =
    placement === "side-branch" ? await runOnSideBranch(pi, ctx) : await runOnMainPath(pi, ctx);
  if (!result) return;
  const { report } = result;

  if (report?.stopReason !== "stop" || !report.text.trim()) {
    ctx.ui.notify("Tooling Retrospective did not complete; nothing was stored.", "warning");
    return;
  }
  const stored = canPersistDebugEvent("info");
  // On the main path the answer is already visible, so no report entry repeats it.
  if (placement === "side-branch") {
    pi.appendEntry<ToolingRetroReportData>(TOOLING_RETRO_REPORT_TYPE, {
      text: report.text,
      stored,
    });
  }
  // No success notice: the side-branch report header already says whether it was stored, and
  // an info notice would be copied into Pi's "Navigated to selected point" status line. On the
  // main path, the not-stored warning before the run is the only signal, as on the side branch.
  if (stored) recordReport(report, ctx.cwd);
  else if (storing) {
    // Repeat the notice only when persistence stopped during the run.
    ctx.ui.notify(NOT_STORED_NOTICE, "warning");
  }
}

/**
 * Register `/supi-tooling-retro`. It asks whether the retrospective runs on a side
 * branch, which returns to the branch point and shows the report outside LLM context,
 * or on the main path, where prompt and report stay in context. When the answer
 * ends normally and Debug persistence is active, it records the report as a
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
