import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { getLocalBranches, getRecentCommits } from "../git.ts";
import { getSelectableReviewModels } from "../model.ts";
import type { ReviewModelSelection, ReviewPlan, ReviewTargetSpec } from "../types.ts";

interface SelectFromListOptions<T> {
  items: SelectItem[];
  title: string;
  maxHeight: number;
  onSelect: (item: SelectItem) => T | undefined;
  initialIndex?: number;
}

/** Shared TUI helper for bordered select lists used throughout the review flow. */
function selectFromList<T>(
  ctx: ExtensionContext,
  options: SelectFromListOptions<T>,
): Promise<T | undefined> {
  const { items, title, maxHeight, onSelect, initialIndex } = options;
  return ctx.ui.custom<T | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", title), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, maxHeight), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    if (initialIndex !== undefined) {
      selectList.setSelectedIndex(initialIndex);
    }
    selectList.onSelect = (item) => done(onSelect(item));
    selectList.onCancel = () => done(undefined);

    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

/** Prompt for the concrete git target to review. */
export async function selectTarget(ctx: ExtensionContext): Promise<ReviewTargetSpec | undefined> {
  const preset = await selectFromList(ctx, {
    items: [
      {
        value: "working-tree",
        label: "Review working tree",
        description: "Staged, unstaged, and untracked changes in the current checkout",
      },
      {
        value: "branch",
        label: "Review changes vs base branch",
        description: "Compare the current branch against another local branch",
      },
      {
        value: "commit",
        label: "Review a commit",
        description: "Review a single recent commit",
      },
    ],
    title: "Select review target",
    maxHeight: 8,
    onSelect: (item) => item.value,
  });

  if (!preset) return undefined;

  switch (preset) {
    case "working-tree":
      return { kind: "working-tree" };
    case "branch": {
      const base = await selectBranch(ctx);
      return base ? { kind: "branch", base } : undefined;
    }
    case "commit": {
      const sha = await selectCommit(ctx);
      return sha ? { kind: "commit", sha } : undefined;
    }
    default:
      return undefined;
  }
}

/** Prompt for the explicit reviewer model used by both synthesis and review. */
export async function selectModel(
  ctx: Pick<ExtensionContext, "cwd" | "modelRegistry" | "model" | "ui">,
): Promise<ReviewModelSelection | undefined> {
  const models = getSelectableReviewModels(ctx);
  if (models.length === 0) {
    ctx.ui.notify(
      "No scoped models are enabled for /supi-review. Configure enabledModels or use /scoped-models.",
      "error",
    );
    return undefined;
  }

  const currentIndex = models.findIndex((model) => model.isCurrent);

  return selectFromList(ctx as ExtensionContext, {
    items: models.map((model) => ({
      value: model.canonicalId,
      label: model.isCurrent ? `${model.canonicalId}  [current]` : model.canonicalId,
      description: model.label !== model.canonicalId ? model.label : undefined,
    })),
    title: "Select scoped reviewer model",
    maxHeight: 12,
    initialIndex: currentIndex >= 0 ? currentIndex : 0,
    onSelect: (item) => models.find((model) => model.canonicalId === item.value),
  });
}

/** Collect an optional freeform note for the generated review brief. */
export async function collectReviewNote(ctx: ExtensionContext): Promise<string | undefined> {
  const value = await ctx.ui.input(
    "Optional review note",
    "Anything specific to watch for? Leave empty to skip.",
  );
  if (value === undefined) return undefined;
  return value.trim();
}

/** Show the synthesized brief and packet coverage, then ask for approval. */
export function previewReviewPlan(ctx: ExtensionContext, plan: ReviewPlan): Promise<boolean> {
  return ctx.ui.confirm("Run generated review?", formatPlanPreview(plan));
}

export async function selectBranch(ctx: ExtensionContext): Promise<string | undefined> {
  const branches = await getLocalBranches(ctx.cwd);
  if (branches.length === 0) {
    ctx.ui.notify("No local branches found", "warning");
    return undefined;
  }

  return selectFromList(ctx, {
    items: branches.map((branch) => ({ value: branch, label: branch })),
    title: "Select base branch",
    maxHeight: 15,
    onSelect: (item) => item.value,
  });
}

export async function selectCommit(ctx: ExtensionContext): Promise<string | undefined> {
  const commits = await getRecentCommits(ctx.cwd, 30);
  if (commits.length === 0) {
    ctx.ui.notify("No recent commits found", "warning");
    return undefined;
  }

  return selectFromList(ctx, {
    items: commits.map((commit) => ({
      value: commit.sha,
      label: `${commit.sha.slice(0, 7)}  ${commit.subject}`,
      description: commit.sha,
    })),
    title: "Select commit to review",
    maxHeight: 15,
    onSelect: (item) => item.value,
  });
}

function formatPlanPreview(plan: ReviewPlan): string {
  const { model, snapshot, brief } = plan;
  const parts: string[] = [
    `Model: ${model.canonicalId}`,
    `Snapshot: ${snapshot.title}`,
    `Files changed: ${snapshot.changedFiles.length}`,
    `Inline diff files: ${plan.packet.includedFiles.length}`,
    `Omitted files: ${plan.packet.omittedFiles.length}`,
    "",
    "Summary:",
    brief.summary,
    "",
    "Intended outcome:",
    brief.intendedOutcome,
  ];

  if (brief.constraints.length > 0) {
    parts.push("", "Constraints:", ...brief.constraints.map((item) => `- ${item}`));
  }
  if (brief.focusAreas.length > 0) {
    parts.push("", "Focus areas:", ...brief.focusAreas.map((item) => `- ${item}`));
  }
  if (brief.riskyFiles.length > 0) {
    parts.push("", "Risky files:", ...brief.riskyFiles.map((item) => `- ${item}`));
  }
  if (brief.unresolvedQuestions.length > 0) {
    parts.push(
      "",
      "Unresolved questions:",
      ...brief.unresolvedQuestions.map((item) => `- ${item}`),
    );
  }
  if (plan.packet.omittedFiles.length > 0) {
    parts.push(
      "",
      "Prompt coverage:",
      `Included: ${plan.packet.includedFiles.join(", ") || "none"}`,
      `Omitted: ${plan.packet.omittedFiles.join(", ")}`,
    );
  }

  return parts.join("\n");
}
