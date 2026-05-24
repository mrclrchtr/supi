import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui";
import { getLocalBranches, getRecentCommits } from "../git.ts";
import { getSelectableReviewModels } from "../model.ts";
import type { ReviewModelSelection, ReviewPlan, ReviewTargetSpec } from "../types.ts";
import type { ReviewTheme } from "./theme-type.ts";

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

/** Show the synthesized brief, the actual reviewer prompt preview, and ask for approval. */
export function previewReviewPlan(ctx: ExtensionContext, plan: ReviewPlan): Promise<boolean> {
  return ctx.ui.custom<boolean>((_tui, theme, _kb, done) => {
    const container = buildReviewPlanContainer(theme, plan);

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        if (data === "\r" || data === "\n" || data === "y" || data === "Y") {
          done(true);
        } else if (data === "\x1b" || data === "n" || data === "N") {
          done(false);
        }
      },
    };
  });
}

/** Build the review plan preview container with all styled sections. */
function buildReviewPlanContainer(theme: ReviewTheme, plan: ReviewPlan): Container {
  const { model, snapshot, brief, packet } = plan;
  const container = new Container();

  const accent = (s: string) => theme.fg("accent", s);
  const dim = (s: string) => theme.fg("dim", s);
  const bold = (s: string) => theme.bold(s);

  // ── Top border ──
  container.addChild(new DynamicBorder((s: string) => accent(s)));
  container.addChild(new Spacer(1));

  // ── Title ──
  container.addChild(new Text(accent(bold("  Review Plan")), 1, 0));
  container.addChild(new Spacer(1));

  // ── Metadata section ──
  const kind = snapshot.target.kind;
  const targetLabel =
    kind === "working-tree"
      ? "Working tree"
      : kind === "branch"
        ? `${snapshot.target.base} \u2190 current`
        : `commit ${snapshot.target.sha.slice(0, 7)}`;

  container.addChild(new Text(accent(bold("  \u2500\u2500 Metadata \u2500\u2500")), 1, 0));
  container.addChild(
    new Text(
      [
        `  ${dim("Model:")}   ${model.canonicalId}`,
        `  ${dim("Target:")}  ${snapshot.title}`,
        `  ${dim("Kind:")}    ${targetLabel}`,
        `  ${dim("Files:")}   ${snapshot.changedFiles.length} changed  ${theme.fg("toolDiffAdded", `+${snapshot.stats.additions}`)}/${theme.fg("toolDiffRemoved", `-${snapshot.stats.deletions}`)}`,
      ].join("\n"),
      1,
      0,
    ),
  );
  container.addChild(new Spacer(1));

  // ── Brief section ──
  container.addChild(
    new Text(accent(bold("  \u2500\u2500 Session-derived Brief \u2500\u2500")), 1, 0),
  );
  const briefParts = [
    `  ${dim("Summary:")}  ${brief.summary}`,
    `  ${dim("Outcome:")}  ${brief.intendedOutcome}`,
  ];
  if (brief.constraints.length > 0) {
    briefParts.push(`  ${dim("Constraints:")}  ${brief.constraints.join("; ")}`);
  }
  if (brief.focusAreas.length > 0) {
    briefParts.push(`  ${dim("Focus:")}  ${brief.focusAreas.join("; ")}`);
  }
  if (brief.riskyFiles.length > 0) {
    briefParts.push(`  ${dim("Risky:")}  ${brief.riskyFiles.join(", ")}`);
  }
  if (brief.unresolvedQuestions.length > 0) {
    briefParts.push(`  ${dim("Questions:")}  ${brief.unresolvedQuestions.join("; ")}`);
  }
  container.addChild(new Text(briefParts.join("\n"), 1, 0));
  container.addChild(new Spacer(1));

  // ── Reviewer Prompt preview ──
  const totalChars = packet.prompt.length;
  const maxPreview = 2000;
  const previewText =
    totalChars > maxPreview
      ? `${packet.prompt.slice(0, maxPreview)}\n\n${theme.fg("warning", `[Preview truncated \u2014 showing ${maxPreview.toLocaleString()} of ${totalChars.toLocaleString()} total chars]`)}`
      : packet.prompt;

  container.addChild(
    new Text(
      accent(
        bold(`  \u2500\u2500 Reviewer Prompt (${totalChars.toLocaleString()} chars) \u2500\u2500`),
      ),
      1,
      0,
    ),
  );
  container.addChild(new Text(previewText, 1, 0));
  container.addChild(new Spacer(1));

  // ── Snapshot access line ──
  const isCompact = packet.charBudget === 0;
  const accessLine = isCompact
    ? `  Diffs: on-demand via read_snapshot_diff  \u2022  Files: ${snapshot.changedFiles.length} changed`
    : `  Included diffs: ${packet.includedFiles.length} file${packet.includedFiles.length === 1 ? "" : "s"}` +
      `  \u2022  Omitted: ${packet.omittedFiles.length} file${packet.omittedFiles.length === 1 ? "" : "s"}` +
      `  \u2022  Budget: ${(packet.charBudget / 1000).toFixed(0)}K chars`;

  container.addChild(new Text(theme.fg("dim", accessLine), 1, 0));
  container.addChild(new Spacer(1));

  // ── Confirm / Cancel hints ──
  container.addChild(
    new Text(
      `  ${dim("Enter")} ${theme.fg("success", "Run review")}  ${dim("\u2022")}  ${dim("Esc")} ${theme.fg("muted", "Cancel")}  ${dim("\u2022 y/n")}`,
      1,
      0,
    ),
  );
  container.addChild(new Spacer(1));

  // ── Bottom border ──
  container.addChild(new DynamicBorder((s: string) => accent(s)));

  return container;
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
