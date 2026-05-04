import { BorderedLoader, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatReviewContent } from "./format-content.ts";
import { getCommitShow, getDiff, getMergeBase, getUncommittedDiff } from "./git.ts";
import { buildReviewPrompt } from "./prompts.ts";
import { registerReviewRenderer } from "./renderer.ts";
import { runReviewer } from "./runner.ts";
import { loadReviewSettings, registerReviewSettings, setReviewModelChoices } from "./settings.ts";
import type { ReviewResult, ReviewTarget } from "./types.ts";
import { selectAutoFix, selectBranch, selectCommit, selectPreset } from "./ui.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

interface ReviewExecutionOptions {
  target: ReviewTarget;
  maxDiffBytes: number;
  ctx: CommandContext;
  signal?: AbortSignal;
}

export default function reviewExtension(pi: ExtensionAPI) {
  registerReviewSettings();
  registerReviewRenderer(pi);

  const syncReviewModelChoices = (ctx: {
    modelRegistry: {
      getAvailable(): Array<{ provider: string; id: string }> | undefined;
    };
  }) => {
    setReviewModelChoices(toCanonicalModelIds(ctx.modelRegistry.getAvailable()));
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
  const preset = await selectPreset(ctx);
  if (!preset) return;

  const autoFix = await selectAutoFix(ctx, autoFixDefault);
  if (autoFix === undefined) return;

  const target = await resolvePresetTarget(preset, ctx);
  if (!target) return;

  const result = await runReviewWithLoader(target, maxDiffBytes, ctx);
  injectReviewMessage(pi, result, autoFix, ctx);
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
      if (target.diff) {
        return { kind: "success", target };
      }
      const baseSha = await getMergeBase(ctx.cwd, target.branch);
      if (!baseSha) {
        return { kind: "failed", reason: `No merge base found for ${target.branch}`, target };
      }
      return { kind: "success", target: { ...target, diff: await getDiff(ctx.cwd, baseSha) } };
    }
    case "uncommitted": {
      if (target.diff) {
        return { kind: "success", target };
      }
      const diff = await getUncommittedDiff(ctx.cwd);
      if (!diff) {
        return { kind: "failed", reason: "No uncommitted changes", target };
      }
      return { kind: "success", target: { ...target, diff } };
    }
    case "commit": {
      if (target.show) {
        return { kind: "success", target };
      }
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

    executeReview({ target, maxDiffBytes, ctx, signal: loader.signal })
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
  const { target, maxDiffBytes, ctx, signal } = options;
  const settings = loadReviewSettings(ctx.cwd);
  const model = resolveReviewerModel(settings, ctx);

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

  return runReviewer({
    prompt,
    model,
    cwd: ctx.cwd,
    target,
    signal,
    onSessionStart: (sessionName) => {
      const message = `Review running in tmux session ${sessionName}`;
      if (ctx.hasUI) {
        ctx.ui.notify(message, "info");
      } else {
        process.stderr.write(`${message}\n`);
      }
    },
  });
}

function toCanonicalModelIds(
  models: Array<{ provider: string; id: string }> | undefined,
): string[] {
  if (!models) return [];
  return Array.from(new Set(models.map((model) => `${model.provider}/${model.id}`)));
}

function resolveReviewerModel(
  settings: ReturnType<typeof loadReviewSettings>,
  ctx: CommandContext,
): string | undefined {
  return settings.reviewModel || resolveSessionModelId(ctx.model);
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

function injectReviewMessage(
  pi: ExtensionAPI,
  result: ReviewResult,
  autoFix: boolean,
  _ctx?: CommandContext,
): void {
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
