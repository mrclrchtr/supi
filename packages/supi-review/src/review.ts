import { buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveBranchSnapshot, resolveCommitSnapshot, resolveWorkingTreeSnapshot } from "./git.ts";
import { collectHistoryEvidence } from "./history/collect.ts";
import { synthesizeReviewBrief } from "./history/synthesize.ts";
import { buildReviewPacket } from "./target/packet.ts";
import { runReviewer } from "./tool/review-runner.ts";
import type { BriefSynthesisRunResult } from "./tool/runner-types.ts";
import type { ReviewPlan, ReviewResult, ReviewSnapshot, ReviewTargetSpec } from "./types.ts";
import { collectReviewNote, previewReviewPlan, selectModel, selectTarget } from "./ui/flow.ts";
import { formatReviewContent } from "./ui/format-content.ts";
import { ReviewProgressWidget } from "./ui/progress-widget.ts";
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
  const evidence = collectHistoryEvidence(sessionContext.messages, snapshot, normalizedNote);
  const synthesis = await runBriefWithLoader({
    snapshot,
    modelId: model.canonicalId,
    ctx,
    pi,
    run: (signal, onProgress) =>
      synthesizeReviewBrief({
        model,
        modelRegistry: ctx.modelRegistry,
        cwd: ctx.cwd,
        snapshot,
        evidence,
        note: normalizedNote,
        signal,
        onProgress,
      }),
  });

  if (synthesis.kind !== "success") {
    notifySynthesisFailure(synthesis, ctx);
    return;
  }

  const brief = {
    ...synthesis.brief,
    note: normalizedNote,
    evidenceCount: evidence.length,
  };

  const packet = buildReviewPacket(snapshot, brief, model);
  const plan: ReviewPlan = { model, snapshot, brief, packet };

  const approved = await previewReviewPlan(ctx, plan);
  if (!approved) return;

  const result = await runReviewWithLoader(plan, ctx, pi);
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

async function runBriefWithLoader(options: {
  snapshot: ReviewSnapshot;
  modelId: string;
  ctx: CommandContext;
  pi: ExtensionAPI;
  run: (
    signal: AbortSignal,
    onProgress: (progress: Parameters<ReviewProgressWidget["updateProgress"]>[0]) => void,
  ) => Promise<BriefSynthesisRunResult>;
}): Promise<BriefSynthesisRunResult> {
  const { snapshot, modelId, ctx, pi, run } = options;
  return ctx.ui.custom<BriefSynthesisRunResult>((tui, theme, _kb, done) => {
    const widget = new ReviewProgressWidget(tui, theme, "Synthesizing review brief…");
    let finished = false;

    const finish = (result: BriefSynthesisRunResult) => {
      if (finished) return;
      finished = true;
      pi.events.emit("supi:working:end", { source: "supi-review" });
      widget.dispose();
      done(result);
    };

    widget.onAbort = () => {
      // The widget aborts its signal; the runner resolves with `canceled`.
    };

    pi.events.emit("supi:working:start", { source: "supi-review" });
    run(widget.signal, (progress) => widget.updateProgress(progress))
      .then((result) => finish(result))
      .catch((error) => {
        finish({
          kind: "failed",
          reason: `Brief synthesis failed for ${snapshot.title} on ${modelId}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });

    return widget;
  });
}

async function runReviewWithLoader(
  plan: ReviewPlan,
  ctx: CommandContext,
  pi: ExtensionAPI,
): Promise<ReviewResult> {
  return ctx.ui.custom<ReviewResult>((tui, theme, _kb, done) => {
    const widget = new ReviewProgressWidget(tui, theme, "Running code review…");
    let finished = false;

    const finish = (result: ReviewResult) => {
      if (finished) return;
      finished = true;
      pi.events.emit("supi:working:end", { source: "supi-review" });
      widget.dispose();
      done(result);
    };

    widget.onAbort = () => {
      // The widget aborts its signal; the runner resolves with `canceled`.
    };

    pi.events.emit("supi:working:start", { source: "supi-review" });
    runReviewer({
      prompt: plan.packet.prompt,
      model: plan.model,
      modelRegistry: ctx.modelRegistry,
      cwd: ctx.cwd,
      signal: widget.signal,
      snapshot: plan.snapshot,
      brief: plan.brief,
      onProgress: (progress) => widget.updateProgress(progress),
    })
      .then((result) => finish(result))
      .catch((error) => {
        finish({
          kind: "failed",
          reason: error instanceof Error ? error.message : String(error),
          snapshot: plan.snapshot,
          brief: plan.brief,
          modelId: plan.model.canonicalId,
        });
      });

    return widget;
  });
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
  const { findings, overall_correctness } = result.output;
  const criticalCount = findings.filter((f) => f.priority === 3).length;
  const majorCount = findings.filter((f) => f.priority === 2).length;

  const findingList = findings.map((finding, index) => `- #${index + 1}: ${finding.title}`);

  const header =
    "A code review just completed and the result is available in the preceding `supi-review` message.";
  const noFixing = "Do not start fixing code immediately.";
  const useAskUser = "If the `ask_user` tool is available, use it for this decision.";

  const appendFindings = (lines: string[]): string[] => [
    ...lines,
    "",
    "Current findings:",
    ...findingList,
  ];

  if (criticalCount > 0) {
    return appendFindings([
      header,
      `⚠️ ${criticalCount} critical finding(s) found. Urge the user to fix before merging.`,
      noFixing,
      useAskUser,
      "Offer these options: Fix all, Fix critical only, Done.",
    ]).join("\n");
  }

  const contradictionNote =
    overall_correctness === "patch is correct" && findings.length > 0
      ? "The reviewer marked the patch as correct but found issues — verify the verdict before acting."
      : undefined;

  if (majorCount > 0) {
    const lines: string[] = [header];
    if (contradictionNote) lines.push(contradictionNote);
    lines.push(
      noFixing,
      useAskUser,
      "Offer exactly these options: Done, Fix all, Fix selected, Verify findings.",
      "If the user chooses Fix selected, ask a follow-up question listing the findings by number/title.",
      "If the user chooses Verify findings, verify the findings first and then ask again whether to Fix all or Fix selected.",
    );
    return appendFindings(lines).join("\n");
  }

  // Only minor/info findings
  return appendFindings([
    header,
    ...(contradictionNote
      ? [contradictionNote]
      : ["Only minor/info suggestions — no blocking issues."]),
    noFixing,
    useAskUser,
    "Offer these options: Apply suggestions, Skip.",
  ]).join("\n");
}
