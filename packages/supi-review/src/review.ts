import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WidgetProgress } from "@mrclrchtr/supi-core/progress-widget";
import { runWithProgressWidget } from "@mrclrchtr/supi-core/tool-framework";
import { resolveBranchSnapshot, resolveCommitSnapshot, resolveWorkingTreeSnapshot } from "./git.ts";
import { serializeSessionContext } from "./history/collect.ts";
import { synthesizeReviewBrief } from "./history/synthesize.ts";
import { buildReviewPacket } from "./target/packet.ts";
import { runReviewer } from "./tool/review-runner.ts";
import type { BriefSynthesisRunResult } from "./tool/runner-types.ts";
import type { ReviewPlan, ReviewResult, ReviewSnapshot, ReviewTargetSpec } from "./types.ts";
import { collectReviewNote, previewReviewPlan, selectModel, selectTarget } from "./ui/flow.ts";
import { formatReviewContent } from "./ui/format-content.ts";
import { registerReviewRenderer } from "./ui/renderer.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

export default function reviewExtension(pi: ExtensionAPI) {
  registerReviewRenderer(pi);

  pi.registerCommand("supi-review", {
    description: "Run a structured code review informed by the current session history",
    handler: async (_args, ctx) => {
      await handleInteractive(ctx, pi);
    },
  });
}

async function handleInteractive(ctx: CommandContext, pi: ExtensionAPI): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  const target = await selectTarget(ctx);
  if (!target) return;

  const model = await selectModel(ctx);
  if (!model) return;

  const note = await collectReviewNote(ctx);
  if (note === undefined) return;
  const normalizedNote = note.trim() || undefined;

  const snapshot = await resolveReviewSnapshot(target, ctx);
  if (!snapshot) return;

  const sessionContext = buildSessionContext(
    ctx.sessionManager.getEntries(),
    ctx.sessionManager.getLeafId(),
  );
  const serializedContext = serializeSessionContext(sessionContext.messages);
  const synthesis = await runWithProgressWidget(
    pi,
    ctx,
    "Synthesizing review brief…",
    (signal: AbortSignal, onProgress: (p: WidgetProgress) => void) =>
      synthesizeReviewBrief({
        model,
        modelRegistry: ctx.modelRegistry,
        cwd: ctx.cwd,
        snapshot,
        serializedContext,
        note: normalizedNote,
        signal,
        onProgress,
      }),
  );

  if (!synthesis) {
    notifyBriefDone(
      pi,
      {
        kind: "failed",
        reason: "Brief synthesis encountered an unexpected error",
      } as BriefSynthesisRunResult,
      snapshot,
      model.canonicalId,
    );
    ctx.ui.notify("Brief synthesis was canceled or failed", "warning");
    return;
  }

  notifyBriefDone(pi, synthesis, snapshot, model.canonicalId);

  if (synthesis.kind !== "success") {
    notifySynthesisFailure(synthesis, ctx);
    return;
  }

  const brief = {
    ...synthesis.brief,
    note: normalizedNote,
  };

  const packet = buildReviewPacket(snapshot, brief, model);
  const plan: ReviewPlan = { model, snapshot, brief, packet };

  const approved = await previewReviewPlan(ctx, plan);
  if (!approved) return;

  const result = await runWithProgressWidget(
    pi,
    ctx,
    "Running code review…",
    (signal: AbortSignal, onProgress: (p: WidgetProgress) => void) =>
      runReviewer({
        prompt: plan.packet.prompt,
        model: plan.model,
        modelRegistry: ctx.modelRegistry,
        cwd: ctx.cwd,
        signal,
        snapshot: plan.snapshot,
        brief: plan.brief,
        onProgress,
      }),
  );

  if (!result) {
    notifyReviewDone(pi, {
      kind: "failed",
      reason: "Review encountered an unexpected error",
      snapshot,
      brief,
      modelId: model.canonicalId,
    } as ReviewResult);
    ctx.ui.notify("Review was canceled or failed", "warning");
    return;
  }

  notifyReviewDone(pi, result);
  injectReviewMessage(pi, result);
}

async function resolveReviewSnapshot(
  target: ReviewTargetSpec,
  ctx: CommandContext,
): Promise<ReviewSnapshot | undefined> {
  const snapshot =
    target.kind === "working-tree"
      ? await resolveWorkingTreeSnapshot(ctx.cwd)
      : target.kind === "branch"
        ? await resolveBranchSnapshot(ctx.cwd, target.base)
        : await resolveCommitSnapshot(ctx.cwd, target.sha);

  if (snapshot) {
    return snapshot;
  }

  switch (target.kind) {
    case "working-tree":
      ctx.ui.notify("No working tree changes found", "warning");
      break;
    case "branch":
      ctx.ui.notify(`No reviewable changes found against ${target.base}`, "warning");
      break;
    case "commit":
      ctx.ui.notify(`Unable to resolve commit ${target.sha}`, "error");
      break;
  }

  return undefined;
}

function notifySynthesisFailure(
  result: Exclude<BriefSynthesisRunResult, { kind: "success" }>,
  ctx: CommandContext,
): void {
  switch (result.kind) {
    case "failed":
      ctx.ui.notify(result.reason, "error");
      break;
    case "timeout":
      ctx.ui.notify(
        `Brief synthesis timed out after ${(result.timeoutMs / 1000).toFixed(0)}s`,
        "warning",
      );
      break;
    case "canceled":
      ctx.ui.notify("Review canceled", "warning");
      break;
  }
}

/** Ring the terminal bell so the user knows to check back. */
function ringBell(): void {
  process.stdout.write("\x07");
}

/**
 * Emit a `supi:review:brief-done` event and ring the terminal bell after
 * brief synthesis completes (success, failure, cancel, or timeout).
 */
function notifyBriefDone(
  pi: ExtensionAPI,
  result: BriefSynthesisRunResult,
  snapshot: ReviewSnapshot,
  modelId: string,
): void {
  pi.events.emit("supi:review:brief-done", {
    kind: result.kind,
    snapshot: snapshot.title,
    modelId,
    brief: result.kind === "success" ? result.brief : undefined,
  });
  ringBell();
}

/**
 * Emit a `supi:review:review-done` event and ring the terminal bell after
 * the review child session completes.
 */
function notifyReviewDone(pi: ExtensionAPI, result: ReviewResult): void {
  pi.events.emit("supi:review:review-done", {
    kind: result.kind,
    snapshot: result.snapshot.title,
    modelId: result.modelId,
    findingsCount: result.kind === "success" ? result.output.findings.length : 0,
  });
  ringBell();
}

function injectReviewMessage(pi: ExtensionAPI, result: ReviewResult): void {
  pi.sendMessage({
    customType: "supi-review",
    content: formatReviewContent(result),
    display: true,
    details: { result },
  });

  maybeQueueReviewFollowUp(pi, result);
}

function maybeQueueReviewFollowUp(pi: ExtensionAPI, result: ReviewResult): void {
  if (result.kind !== "success" || result.output.findings.length === 0) {
    return;
  }

  pi.sendMessage(
    {
      customType: "supi-review-followup",
      content: buildReviewFollowUpInstruction(result),
      display: false,
      details: {
        findingCount: result.output.findings.length,
        findings: result.output.findings.map((finding, index) => ({
          number: index + 1,
          title: finding.title,
        })),
      },
    },
    { triggerTurn: true },
  );
}

function buildReviewFollowUpInstruction(
  result: Extract<ReviewResult, { kind: "success" }>,
): string {
  const { findings } = result.output;
  const criticalCount = findings.filter((f) => f.priority === 3).length;
  const majorCount = findings.filter((f) => f.priority === 2).length;

  const findingList = findings.map((f, i) => `- #${i + 1}: ${f.title}`);

  const header =
    "A code review just completed and the result is available in the preceding `supi-review` message.";
  const noFixing = "Do not start fixing code immediately.";
  const useAskUser = "If the `ask_user` tool is available, use it for this decision.";

  const lines: string[] = [header];

  // Severity-aware urgency note.
  if (criticalCount > 0) {
    lines.push(`⚠️ ${criticalCount} critical finding(s) — urge the user to fix before merging.`);
  } else if (majorCount > 0) {
    lines.push(`${majorCount} major finding(s) — review carefully before proceeding.`);
  }

  // Always offer the same core options.
  lines.push(noFixing, useAskUser);
  lines.push("Offer these options: Fix all, Fix selected, Verify findings, Skip.");
  lines.push(
    "If the user chooses Fix selected, ask a follow-up question listing the findings by number/title.",
  );
  lines.push(
    "If the user chooses Verify findings, re-read the relevant files and diffs to independently confirm or refute each finding, then present the verified results and ask again.",
  );

  // Always append the findings list.
  lines.push("", "Current findings:", ...findingList);

  return lines.join("\n");
}
