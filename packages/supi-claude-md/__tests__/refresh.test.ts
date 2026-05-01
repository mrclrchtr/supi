import { describe, expect, it } from "vitest";
import type { ClaudeMdConfig } from "../config.ts";
import { CLAUDE_MD_DEFAULTS } from "../config.ts";
import type { ContextUsage } from "../refresh.ts";
import { readNativeContextFiles, shouldRefreshRoot } from "../refresh.ts";
import type { ClaudeMdState } from "../state.ts";
import { createInitialState } from "../state.ts";

function makeState(overrides: Partial<ClaudeMdState> = {}): ClaudeMdState {
  return { ...createInitialState(), ...overrides };
}

describe("shouldRefreshRoot", () => {
  it("returns false when interval is 0", () => {
    const state = makeState({ completedTurns: 5 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(false);
  });

  it("returns true when turn interval is met", () => {
    const state = makeState({
      completedTurns: 6,
      lastRefreshTurn: 3,
    });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(true);
  });

  it("returns false when turn interval is not met", () => {
    const state = makeState({
      completedTurns: 4,
      lastRefreshTurn: 3,
    });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(false);
  });

  it("returns true at exact boundary", () => {
    const state = makeState({
      completedTurns: 6,
      lastRefreshTurn: 3,
    });
    // 6 - 3 = 3 >= 3
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(true);
  });

  it("returns false when rereadInterval is 0 but turns elapsed", () => {
    const state = makeState({ completedTurns: 10, lastRefreshTurn: 0 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(false);
  });

  describe("context threshold gating", () => {
    const freshState = makeState({ completedTurns: 6, lastRefreshTurn: 3 });

    it("returns false when context usage percent >= threshold", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 80 };
      const usage: ContextUsage = { tokens: 100_000, contextWindow: 128_000, percent: 85 };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(false);
    });

    it("returns true when context usage percent < threshold", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 80 };
      const usage: ContextUsage = { tokens: 50_000, contextWindow: 128_000, percent: 50 };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(true);
    });

    it("returns false when context usage percent equals threshold exactly", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 80 };
      const usage: ContextUsage = { tokens: 102_400, contextWindow: 128_000, percent: 80 };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(false);
    });

    it("returns true when contextUsage.percent is null (post-compaction)", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 80 };
      const usage: ContextUsage = { tokens: null, contextWindow: 128_000, percent: null };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(true);
    });

    it("returns true when contextUsage is undefined", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 80 };
      expect(shouldRefreshRoot(freshState, config, undefined)).toBe(true);
    });

    it("with threshold 100, injection proceeds at 99% usage", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 100 };
      const usage: ContextUsage = { tokens: 126_720, contextWindow: 128_000, percent: 99 };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(true);
    });

    it("with threshold 100, injection proceeds at 100% usage", () => {
      const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 100 };
      const usage: ContextUsage = { tokens: 128_000, contextWindow: 128_000, percent: 100 };
      expect(shouldRefreshRoot(freshState, config, usage)).toBe(true);
    });

    it("disable flag (rereadInterval=0) takes precedence over context threshold", () => {
      const state = makeState({ completedTurns: 10, lastRefreshTurn: 0 });
      const config: ClaudeMdConfig = {
        ...CLAUDE_MD_DEFAULTS,
        rereadInterval: 0,
        contextThreshold: 80,
      };
      const usage: ContextUsage = { tokens: 10_000, contextWindow: 128_000, percent: 10 };
      expect(shouldRefreshRoot(state, config, usage)).toBe(false);
    });
  });
});

describe("readNativeContextFiles", () => {
  const cwd = "/Users/alice/projects/myapp";

  it("excludes files outside the project tree (home directory)", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/AGENTS.md", content: "dotfiles guide" }],
      cwd,
    );
    expect(result).toEqual([]);
  });

  it("includes files at project root", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" }],
      cwd,
    );
    expect(result).toEqual([{ path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" }]);
  });

  it("includes files in subdirectories", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/projects/myapp/packages/foo/CLAUDE.md", content: "# Foo" }],
      cwd,
    );
    expect(result).toEqual([
      { path: "/Users/alice/projects/myapp/packages/foo/CLAUDE.md", content: "# Foo" },
    ]);
  });

  it("excludes entries with no path", () => {
    const result = readNativeContextFiles([{ path: undefined, content: "stuff" }], cwd);
    expect(result).toEqual([]);
  });

  it("excludes entries with no content", () => {
    const result = readNativeContextFiles([{ path: "/foo.md", content: undefined }], cwd);
    expect(result).toEqual([]);
  });

  it("mixes included and excluded files", () => {
    const result = readNativeContextFiles(
      [
        { path: "/Users/alice/AGENTS.md", content: "dotfiles" },
        { path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" },
        { path: "/Users/alice/projects/myapp/packages/bar/CLAUDE.md", content: "# Bar" },
      ],
      cwd,
    );
    expect(result).toEqual([
      { path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" },
      { path: "/Users/alice/projects/myapp/packages/bar/CLAUDE.md", content: "# Bar" },
    ]);
  });
});
