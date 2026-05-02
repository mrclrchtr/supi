import { DynamicBorder, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import { getLocalBranches, getRecentCommits } from "./git.ts";
import { loadReviewSettings } from "./settings.ts";
import type { ReviewDepth } from "./types.ts";

export type Preset = "base-branch" | "uncommitted" | "commit" | "custom";

export async function selectPreset(ctx: ExtensionContext): Promise<Preset | undefined> {
  const items: SelectItem[] = [
    { value: "base-branch", label: "Review against a base branch" },
    { value: "uncommitted", label: "Review uncommitted changes" },
    { value: "commit", label: "Review a commit" },
    { value: "custom", label: "Custom review instructions" },
  ];

  return ctx.ui.custom<Preset | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", "Select review target"), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    selectList.onSelect = (item) => done(item.value as Preset);
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

export async function selectDepth(ctx: ExtensionContext): Promise<ReviewDepth | undefined> {
  const settings = loadReviewSettings(ctx.cwd);
  const fastLabel = settings.reviewFastModel ? `Fast (${settings.reviewFastModel})` : "Fast";
  const deepLabel = settings.reviewDeepModel ? `Deep (${settings.reviewDeepModel})` : "Deep";

  const items: SelectItem[] = [
    { value: "inherit", label: "Inherit", description: "Use current session model" },
    { value: "fast", label: fastLabel },
    { value: "deep", label: deepLabel },
  ];

  return ctx.ui.custom<ReviewDepth | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", "Select review depth"), 1, 0));

    const selectList = new SelectList(items, items.length, {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    selectList.onSelect = (item) => done(item.value as ReviewDepth);
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

export async function selectBranch(ctx: ExtensionContext): Promise<string | undefined> {
  const branches = await getLocalBranches(ctx.cwd);
  if (branches.length === 0) {
    ctx.ui.notify("No local branches found", "warning");
    return undefined;
  }

  const items: SelectItem[] = branches.map((b) => ({ value: b, label: b }));

  return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", "Select base branch"), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 15), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    selectList.onSelect = (item) => done(item.value);
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

export async function selectCommit(ctx: ExtensionContext): Promise<string | undefined> {
  const commits = await getRecentCommits(ctx.cwd, 30);
  if (commits.length === 0) {
    ctx.ui.notify("No recent commits found", "warning");
    return undefined;
  }

  const items: SelectItem[] = commits.map((c) => ({
    value: c.sha,
    label: `${c.sha.slice(0, 7)}  ${c.subject}`,
    description: c.sha,
  }));

  return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", "Select commit to review"), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 15), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    selectList.onSelect = (item) => done(item.value);
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
