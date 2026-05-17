// biome-ignore lint/nursery/noExcessiveLinesPerFile: pre-existing, needs refactoring
import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { buildDynamicBrief, buildStandardBrief } from "./briefs.ts";
import { formatReviewContent } from "./format-content.ts";
import {
  getCommitFileNames,
  getCommitShow,
  getDiff,
  getDiffFileNames,
  getMergeBase,
  getUncommittedDiff,
  getUncommittedFileNames,
} from "./git.ts";
import { ReviewProgressWidget } from "./progress-widget.ts";
import { buildReviewPrompt } from "./prompts.ts";
import { registerReviewRenderer } from "./renderer.ts";
import { runReviewer } from "./runner.ts";
import type { ReviewerInvocation } from "./runner-types.ts";
import {
  filterByEnabledModels,
  loadReviewSettings,
  readPiEnabledModels,
  registerReviewSettings,
  setReviewModelChoices,
} from "./settings.ts";
import { resolveGitTarget } from "./target-resolution.ts";
import type { ReviewBrief, ReviewResult, ReviewTarget } from "./types.ts";
import {
  approveBriefViaEditor,
  collectDynamicInputs,
  selectAutoFix,
  selectBranch,
  selectCommit,
  selectPreset,
  selectProfile,
  selectReviewMode,
} from "./ui.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

interface ReviewExecutionOptions {
  target: ReviewTarget;
  brief: ReviewBrief;
  maxDiffBytes: number;
  ctx: CommandContext;
  signal?: AbortSignal;
  onToolActivity?: ReviewerInvocation["onToolActivity"];
  onProgress?: ReviewerInvocation["onProgress"];
}

export default function reviewExtension(pi: ExtensionAPI) {
  registerReviewSettings();
  registerReviewRenderer(pi);

  const syncReviewModelChoices = (ctx: {
    modelRegistry: {
      getAvailable(): Array<{ provider: string; id: string }> | undefined;
    };
  }) => {
    const allModels = ctx.modelRegistry.getAvailable();
    if (!allModels) {
      setReviewModelChoices([]);
      return;
    }

    // Try to respect PI's scoped models (enabledModels).
    // Workaround for pi-mono#3535 — swap to ctx.scopedModels when exposed by PI.
    const enabledPatterns = readPiEnabledModels();
    const models = enabledPatterns ? filterByEnabledModels(enabledPatterns, allModels) : allModels;

    setReviewModelChoices(toCanonicalModelIds(models));
  };

  pi.on("session_start", async (_event, ctx) => {
    syncReviewModelChoices(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    syncReviewModelChoices(ctx);
  });

  pi.registerCommand("supi-review", {
    description: "Run a structured code review",
    handler: async (_args, ctx) => {
      const settings = loadReviewSettings(ctx.cwd);
      await handleInteractive(settings.maxDiffBytes, settings.autoFix, ctx, pi);
    },
  });
}

async function handleInteractive(
  maxDiffBytes: number,
  autoFixDefault: boolean,
  ctx: CommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  // Step 1: Select review mode
  const mode = await selectReviewMode(ctx);
  if (!mode) return;

  // Step 2: Select review target
  const preset = await selectPreset(ctx);
  if (!preset) return;

  const target = await resolvePresetTarget(preset, ctx);
  if (!target) return;

  // Step 3: Build the review brief
  let brief: ReviewBrief;
  if (mode === "standard") {
    const profileId = await selectProfile(ctx);
    if (!profileId) return;
    brief = buildStandardBrief(profileId);
  } else {
    const inputs = await collectDynamicInputs(ctx);
    if (!inputs) return;
    brief = buildDynamicBrief(inputs);
  }

  // Step 4: Assemble the full prompt and get user approval
  const diffOrBody = getDiffText(target);
  const truncated = maybeTruncateDiff(diffOrBody, maxDiffBytes);
  const draftPrompt = buildReviewPrompt(
    target,
    truncated.text,
    truncated.wasTruncated
      ? { truncated: true, truncatedBytes: truncated.truncatedBytes }
      : undefined,
  );

  // Show the brief context + draft prompt for approval
  const approvalText = await approveBriefViaEditor(ctx, formatBriefWithPrompt(brief, draftPrompt));
  if (!approvalText) return;

  brief.finalPrompt = approvalText;

  // Step 5: Auto-fix preference
  const autoFix = await selectAutoFix(ctx, autoFixDefault);
  if (autoFix === undefined) return;

  // Step 6: Run the review
  const result = await runReviewWithLoader(brief, target, maxDiffBytes, ctx, pi);
  injectReviewMessage(pi, result, autoFix);
}

/** Extract the diff/show text from a target for display. */
function getDiffText(target: ReviewTarget): string {
  if (target.type === "base-branch" || target.type === "uncommitted") {
    return target.diff;
  }
  if (target.type === "commit") {
    return target.show;
  }
  return "";
}

/** Format the brief summary + full prompt for editor approval. */
function formatBriefWithPrompt(brief: ReviewBrief, prompt: string): string {
  return [
    "# Review Brief",
    "",
    brief.mode === "standard"
      ? `Profile: ${brief.profileId ?? "standard"}`
      : "Review mode: dynamic",
    `Summary: ${brief.summary}`,
    `Intended outcome: ${brief.intent}`,
    `Focus areas: ${brief.focus}`,
    "",
    "# Suggested review prompt",
    "",
    "Edit the prompt below if needed, then save and close to start the review.",
    "",
    prompt,
  ].join("\n");
}

async function resolvePresetTarget(
  preset: import("./ui.ts").Preset,
  ctx: CommandContext,
): Promise<ReviewTarget | undefined> {
  switch (preset) {
    case "base-branch": {
      const branch = await selectBranch(ctx);
      if (!branch) return undefined;
      const baseSha = await getMergeBase(ctx.cwd, branch);
      if (!baseSha) {
        ctx.ui.notify(`No merge base found for ${branch}`, "error");
        return undefined;
      }
      const [diff, changedFiles] = await Promise.all([
        getDiff(ctx.cwd, baseSha),
        getDiffFileNames(ctx.cwd, baseSha),
      ]);
      return { type: "base-branch", branch, diff, changedFiles };
    }
    case "uncommitted": {
      const [diff, changedFiles] = await Promise.all([
        getUncommittedDiff(ctx.cwd),
        getUncommittedFileNames(ctx.cwd),
      ]);
      if (!diff) {
        ctx.ui.notify("No uncommitted changes", "warning");
        return undefined;
      }
      return { type: "uncommitted", diff, changedFiles };
    }
    case "commit": {
      const sha = await selectCommit(ctx);
      if (!sha) return undefined;
      const [show, changedFiles] = await Promise.all([
        getCommitShow(ctx.cwd, sha),
        getCommitFileNames(ctx.cwd, sha),
      ]);
      return { type: "commit", sha, show, changedFiles };
    }
    case "custom": {
      const instructions = await ctx.ui.editor(
        "Review instructions",
        "Focus on security, performance, and correctness…",
      );
      if (!instructions?.trim()) {
        ctx.ui.notify("No instructions provided", "warning");
        return undefined;
      }
      const changedFiles = await getUncommittedFileNames(ctx.cwd);
      return { type: "custom", instructions: instructions.trim(), changedFiles };
    }
  }
}

async function executeReview(options: ReviewExecutionOptions): Promise<ReviewResult> {
  const { target, ctx, signal } = options;
  const resolved = await resolveGitTarget(target, ctx);
  if (resolved.kind !== "success") return resolved;
  if (signal?.aborted) {
    return { kind: "canceled", target: resolved.target };
  }
  return runReview({ ...options, target: resolved.target });
}

// biome-ignore lint/complexity/useMaxParams: needs to pass brief, target, diffBytes, ctx, and pi for the full pipeline
async function runReviewWithLoader(
  brief: ReviewBrief,
  target: ReviewTarget,
  maxDiffBytes: number,
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
      done(result);
    };

    widget.onAbort = () => finish({ kind: "canceled", target });

    pi.events.emit("supi:working:start", { source: "supi-review" });

    executeReview({
      target,
      brief,
      maxDiffBytes,
      ctx,
      signal: widget.signal,
      onProgress: (progress) => widget.updateProgress(progress),
    })
      .then((result) => {
        if (widget.signal.aborted) return;
        finish(result);
      })
      .catch((err) => {
        if (widget.signal.aborted) return;
        finish({
          kind: "failed",
          reason: err instanceof Error ? err.message : String(err),
          target,
        });
      });

    return widget;
  });
}

function runReview(options: ReviewExecutionOptions): Promise<ReviewResult> {
  const { target, brief, ctx, signal, onToolActivity, onProgress } = options;
  const settings = loadReviewSettings(ctx.cwd);
  const model = resolveReviewerModel(settings, ctx.modelRegistry, ctx.model);
  if (!model) {
    return Promise.resolve({
      kind: "failed",
      reason:
        "No review model configured. Set a review model in settings or load a model in the session.",
      target,
    });
  }

  // Use the approved brief's final prompt directly
  const prompt = brief.finalPrompt;

  const invocation: ReviewerInvocation = {
    prompt,
    model,
    modelRegistry: ctx.modelRegistry,
    cwd: ctx.cwd,
    target,
    brief,
    signal,
    onToolActivity,
    onProgress,
  };

  return runReviewer(invocation);
}

function toCanonicalModelIds(
  models: Array<{ provider: string; id: string }> | undefined,
): string[] {
  if (!models) return [];
  return Array.from(new Set(models.map((model) => `${model.provider}/${model.id}`)));
}

function resolveReviewerModel(
  settings: ReturnType<typeof loadReviewSettings>,
  modelRegistry: ModelRegistry,
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  sessionModel: Model<any> | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
): Model<any> | undefined {
  const modelString = settings.reviewModel || resolveSessionModelId(sessionModel);
  if (!modelString) return undefined;

  // Parse "provider/model-id" format
  const slashIndex = modelString.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid review model format: "${modelString}". Expected "provider/model-id".`);
  }

  const provider = modelString.slice(0, slashIndex);
  const modelId = modelString.slice(slashIndex + 1);
  const found = modelRegistry.find(provider, modelId);
  if (!found) {
    throw new Error(`Review model "${modelString}" not found. Check your review model setting.`);
  }
  return found;
}

function resolveSessionModelId(
  model: Pick<NonNullable<CommandContext["model"]>, "id" | "provider"> | undefined,
): string | undefined {
  if (!model?.id) return undefined;
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function maybeTruncateDiff(
  diff: string,
  maxBytes: number,
): { text: string; wasTruncated: boolean; truncatedBytes: number } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(diff);
  if (bytes.length <= maxBytes) {
    return { text: diff, wasTruncated: false, truncatedBytes: 0 };
  }

  const headBytes = Math.floor(maxBytes / 2);
  const tailBytes = maxBytes - headBytes;

  let headEnd = 0;
  let headCount = 0;
  for (let i = 0; i < diff.length; i++) {
    const b = encoder.encode(diff[i] ?? "");
    if (headCount + b.length > headBytes) break;
    headCount += b.length;
    headEnd = i + 1;
  }

  let tailStart = diff.length;
  let tailCount = 0;
  for (let i = diff.length - 1; i >= 0; i--) {
    const b = encoder.encode(diff[i] ?? "");
    if (tailCount + b.length > tailBytes) break;
    tailCount += b.length;
    tailStart = i;
  }

  if (tailStart <= headEnd) {
    const truncated = new TextDecoder().decode(bytes.slice(0, maxBytes));
    return { text: truncated, wasTruncated: true, truncatedBytes: bytes.length - maxBytes };
  }

  const head = diff.slice(0, headEnd);
  const tail = diff.slice(tailStart);
  const omitted = bytes.length - headCount - tailCount;
  return {
    text: `${head}\n[... truncated ${omitted} bytes ...]\n${tail}`,
    wasTruncated: true,
    truncatedBytes: omitted,
  };
}

function injectReviewMessage(pi: ExtensionAPI, result: ReviewResult, autoFix: boolean): void {
  pi.sendMessage({
    customType: "supi-review",
    content: formatReviewContent(result),
    display: true,
    details: { result },
  });

  if (autoFix && result.kind === "success" && result.output.findings.length > 0) {
    pi.sendUserMessage("Fix all findings from the review above.");
  }
}
