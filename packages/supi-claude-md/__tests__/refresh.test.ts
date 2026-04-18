import { describe, expect, it } from "vitest";
import type { ClaudeMdConfig } from "../config.ts";
import { CLAUDE_MD_DEFAULTS } from "../config.ts";
import { readNativeContextFiles, shouldRefreshRoot } from "../refresh.ts";
import type { ClaudeMdState } from "../state.ts";
import { createInitialState } from "../state.ts";

function makeState(overrides: Partial<ClaudeMdState> = {}): ClaudeMdState {
  return { ...createInitialState(), ...overrides };
}

describe("shouldRefreshRoot", () => {
  it("returns true when needsRefresh flag is set", () => {
    const state = makeState({ needsRefresh: true, completedTurns: 0 });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(true);
  });

  it("returns false when interval is 0 and no needsRefresh", () => {
    const state = makeState({ needsRefresh: false, completedTurns: 5 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(false);
  });

  it("returns true when turn interval is met", () => {
    const state = makeState({
      needsRefresh: false,
      completedTurns: 6,
      lastRefreshTurn: 3,
    });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(true);
  });

  it("returns false when turn interval is not met", () => {
    const state = makeState({
      needsRefresh: false,
      completedTurns: 4,
      lastRefreshTurn: 3,
    });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(false);
  });

  it("returns true at exact boundary", () => {
    const state = makeState({
      needsRefresh: false,
      completedTurns: 6,
      lastRefreshTurn: 3,
    });
    // 6 - 3 = 3 >= 3
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(true);
  });

  it("needsRefresh overrides interval=0", () => {
    const state = makeState({ needsRefresh: true, completedTurns: 0 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(true);
  });

  it("returns false when rereadInterval is 0, no needsRefresh, but turns elapsed", () => {
    const state = makeState({ needsRefresh: false, completedTurns: 10, lastRefreshTurn: 0 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(false);
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
