import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { getLocalBranches, getRecentCommits } from "./git.ts";

export type Preset = "base-branch" | "uncommitted" | "commit" | "custom";

interface SelectFromListOptions<T> {
  items: SelectItem[];
  title: string;
  maxHeight: number;
  onSelect: (item: SelectItem) => T | undefined;
  initialIndex?: number;
}

/**
 * Shared TUI helper: renders a SelectList inside a bordered container with
 * standard theme colors, keyboard hints, and cancel-on-escape behavior.
 */
function selectFromList<T>(
  ctx: ExtensionContext,
  options: SelectFromListOptions<T>,
): Promise<T | undefined> {
  const { items, title, maxHeight, onSelect, initialIndex } = options;
  return ctx.ui.custom<T | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", title), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, maxHeight), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    if (initialIndex !== undefined) {
      selectList.setSelectedIndex(initialIndex);
    }
    selectList.onSelect = (item) => done(onSelect(item));
    selectList.onCancel = () => done(undefined);
    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

export async function selectPreset(ctx: ExtensionContext): Promise<Preset | undefined> {
  return selectFromList(ctx, {
    items: [
      { value: "base-branch", label: "Review against a base branch" },
      { value: "uncommitted", label: "Review uncommitted changes" },
      { value: "commit", label: "Review a commit" },
      { value: "custom", label: "Custom review instructions" },
    ],
    title: "Select review target",
    maxHeight: 10,
    onSelect: (item) => item.value as Preset,
  });
}

export async function selectAutoFix(
  ctx: ExtensionContext,
  defaultValue: boolean,
): Promise<boolean | undefined> {
  return selectFromList(ctx, {
    items: [
      { value: "true", label: "Yes — fix all findings" },
      { value: "false", label: "No — review only" },
    ],
    title: "Auto-fix after review?",
    maxHeight: 2,
    onSelect: (item) => item.value === "true",
    initialIndex: defaultValue ? 0 : 1,
  });
}

export async function selectBranch(ctx: ExtensionContext): Promise<string | undefined> {
  const branches = await getLocalBranches(ctx.cwd);
  if (branches.length === 0) {
    ctx.ui.notify("No local branches found", "warning");
    return undefined;
  }
  return selectFromList(ctx, {
    items: branches.map((b) => ({ value: b, label: b })),
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
    items: commits.map((c) => ({
      value: c.sha,
      label: `${c.sha.slice(0, 7)}  ${c.subject}`,
      description: c.sha,
    })),
    title: "Select commit to review",
    maxHeight: 15,
    onSelect: (item) => item.value,
  });
}
