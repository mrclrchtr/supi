import { BorderedLoader, type ExtensionAPI, SettingsManager } from "@mariozechner/pi-coding-agent";
import { parseNonInteractiveArgs } from "./args.ts";
import { getCommitShow, getDiff, getMergeBase, getUncommittedDiff } from "./git.ts";
import { getReviewModelChoices } from "./model-choices.ts";
import { buildReviewPrompt } from "./prompts.ts";
import { registerReviewRenderer } from "./renderer.ts";
import { runReviewer } from "./runner.ts";
import { loadReviewSettings, registerReviewSettings, setReviewModelChoices } from "./settings.ts";
import type { ReviewDepth, ReviewResult, ReviewTarget } from "./types.ts";
import { selectBranch, selectCommit, selectDepth, selectPreset } from "./ui.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

interface ReviewExecutionOptions {
  target: ReviewTarget;
  depth: ReviewDepth;
  maxDiffBytes: number;
  ctx: CommandContext;
  signal?: AbortSignal;
}

export default function reviewExtension(pi: ExtensionAPI) {
  registerReviewSettings();
  registerReviewRenderer(pi);

  const syncReviewModelChoices = (ctx: {
    cwd: string;
    modelRegistry: { getAvailable(): Array<{ provider: string; id: string; name?: string }> };
  }) => {
    const settingsPatterns = SettingsManager.create(ctx.cwd).getEnabledModels() ?? [];
    setReviewModelChoices(
      getReviewModelChoices(ctx.modelRegistry.getAvailable(), { settingsPatterns }),
    );
  };

  pi.on("session_start", async (_event, ctx) => {
    syncReviewModelChoices(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    syncReviewModelChoices(ctx);
  });

  pi.registerCommand("review", {
    description: "Run a structured code review",
    handler: async (args, ctx) => {
      const settings = loadReviewSettings(ctx.cwd);

      if (!ctx.hasUI) {
        await handleNonInteractive(args, settings.maxDiffBytes, ctx, pi);
        return;
      }

      await handleInteractive(settings.maxDiffBytes, ctx, pi);
    },
  });
}

async function handleNonInteractive(
  args: string,
  maxDiffBytes: number,
  ctx: CommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const parsed = parseNonInteractiveArgs(args);
  if (!parsed.ok) {
    injectReviewMessage(pi, {
      kind: "failed",
      reason: parsed.error,
      target: { type: "custom", instructions: args },
    });
    return;
  }
  const result = await executeReview({
    target: parsed.target,
    depth: parsed.depth,
    maxDiffBytes,
    ctx,
  });
  injectReviewMessage(pi, result);
}

async function handleInteractive(
  maxDiffBytes: number,
  ctx: CommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const preset = await selectPreset(ctx);
  if (!preset) return;

  const depth = await selectDepth(ctx);
  if (!depth) return;

  const target = await resolvePresetTarget(preset, ctx);
  if (!target) return;

  const result = await runReviewWithLoader(target, depth, maxDiffBytes, ctx);
  injectReviewMessage(pi, result);
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
      const diff = await getDiff(ctx.cwd, baseSha);
      return { type: "base-branch", branch, diff };
    }
    case "uncommitted": {
      const diff = await getUncommittedDiff(ctx.cwd);
      if (!diff) {
        ctx.ui.notify("No uncommitted changes", "warning");
        return undefined;
      }
      return { type: "uncommitted", diff };
    }
    case "commit": {
      const sha = await selectCommit(ctx);
      if (!sha) return undefined;
      const show = await getCommitShow(ctx.cwd, sha);
      return { type: "commit", sha, show };
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
      return { type: "custom", instructions: instructions.trim() };
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

async function resolveGitTarget(
  target: ReviewTarget,
  ctx: CommandContext,
): Promise<{ kind: "success"; target: ReviewTarget } | ReviewResult> {
  switch (target.type) {
    case "base-branch": {
      const baseSha = await getMergeBase(ctx.cwd, target.branch);
      if (!baseSha) {
        return { kind: "failed", reason: `No merge base found for ${target.branch}`, target };
      }
      return { kind: "success", target: { ...target, diff: await getDiff(ctx.cwd, baseSha) } };
    }
    case "uncommitted": {
      const diff = await getUncommittedDiff(ctx.cwd);
      if (!diff) {
        return { kind: "failed", reason: "No uncommitted changes", target };
      }
      return { kind: "success", target: { ...target, diff } };
    }
    case "commit": {
      return {
        kind: "success",
        target: { ...target, show: await getCommitShow(ctx.cwd, target.sha) },
      };
    }
    case "custom": {
      return { kind: "success", target };
    }
  }
}

async function runReviewWithLoader(
  target: ReviewTarget,
  depth: ReviewDepth,
  maxDiffBytes: number,
  ctx: CommandContext,
): Promise<ReviewResult> {
  return ctx.ui.custom<ReviewResult>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, "Running code review…");
    let finished = false;

    const finish = (result: ReviewResult) => {
      if (finished) return;
      finished = true;
      done(result);
    };

    loader.onAbort = () => finish({ kind: "canceled", target });

    executeReview({ target, depth, maxDiffBytes, ctx, signal: loader.signal })
      .then((result) => {
        if (loader.signal.aborted) return;
        finish(result);
      })
      .catch((err) => {
        if (loader.signal.aborted) return;
        finish({
          kind: "failed",
          reason: err instanceof Error ? err.message : String(err),
          target,
        });
      });

    return loader;
  });
}

function runReview(options: ReviewExecutionOptions): Promise<ReviewResult> {
  const { target, depth, maxDiffBytes, ctx, signal } = options;
  const settings = loadReviewSettings(ctx.cwd);
  const model = resolveModel(depth, settings, ctx);

  let diffOrBody = "";
  if (target.type === "base-branch" || target.type === "uncommitted") {
    diffOrBody = target.diff;
  } else if (target.type === "commit") {
    diffOrBody = target.show;
  }

  const truncated = maybeTruncateDiff(diffOrBody, maxDiffBytes);
  const prompt = buildReviewPrompt(
    target,
    truncated.text,
    truncated.wasTruncated
      ? { truncated: true, truncatedBytes: truncated.truncatedBytes }
      : undefined,
  );

  return runReviewer({ prompt, model, cwd: ctx.cwd, target, signal });
}

function resolveModel(
  depth: ReviewDepth,
  settings: ReturnType<typeof loadReviewSettings>,
  ctx: CommandContext,
): string | undefined {
  if (depth === "fast" && settings.reviewFastModel) return settings.reviewFastModel;
  if (depth === "deep" && settings.reviewDeepModel) return settings.reviewDeepModel;
  return ctx.model?.id;
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

function injectReviewMessage(pi: ExtensionAPI, result: ReviewResult): void {
  let content: string;
  switch (result.kind) {
    case "success":
      content = `${result.output.findings.length} findings • ${result.output.overall_correctness}`;
      break;
    case "failed":
      content = `Review failed: ${result.reason}`;
      break;
    case "canceled":
      content = "Review canceled";
      break;
    case "timeout":
      content = "Review timed out";
      break;
  }

  pi.sendMessage({
    customType: "supi-review",
    content,
    display: true,
    details: { result },
  });
}
