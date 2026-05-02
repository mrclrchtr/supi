import { describe, expect, it } from "vitest";
import type { ClaudeMdConfig } from "../config.ts";
import { CLAUDE_MD_DEFAULTS } from "../config.ts";
import type { ContextUsage } from "../refresh.ts";
// biome-ignore lint/suspicious/noDeprecatedImports: testing inert historical helpers
import { readNativeContextFiles, shouldRefreshRoot } from "../refresh.ts";
import type { ClaudeMdState } from "../state.ts";
import { createInitialState } from "../state.ts";

function makeState(overrides: Partial<ClaudeMdState> = {}): ClaudeMdState {
  return { ...createInitialState(), ...overrides };
}

describe("shouldRefreshRoot", () => {
  it("always returns false because root/native refresh is retired", () => {
    const state = makeState({ completedTurns: 5 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    expect(shouldRefreshRoot(state, config)).toBe(false);
  });

  it("returns false even when turn interval would have been met", () => {
    const state = makeState({
      completedTurns: 6,
      lastRefreshTurn: 3,
    });
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS)).toBe(false);
  });

  it("returns false regardless of context usage", () => {
    const state = makeState({ completedTurns: 6, lastRefreshTurn: 3 });
    const usage: ContextUsage = { tokens: 100_000, contextWindow: 128_000, percent: 85 };
    expect(shouldRefreshRoot(state, CLAUDE_MD_DEFAULTS, usage)).toBe(false);
  });

  it("returns false even with threshold 100 and low usage", () => {
    const state = makeState({ completedTurns: 6, lastRefreshTurn: 3 });
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, contextThreshold: 100 };
    const usage: ContextUsage = { tokens: 10_000, contextWindow: 128_000, percent: 10 };
    expect(shouldRefreshRoot(state, config, usage)).toBe(false);
  });
});

describe("readNativeContextFiles", () => {
  const cwd = "/Users/alice/projects/myapp";

  it("returns empty array for home directory files", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/AGENTS.md", content: "dotfiles guide" }],
      cwd,
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for project root files", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" }],
      cwd,
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for native subdirectory files", () => {
    const result = readNativeContextFiles(
      [{ path: "/Users/alice/projects/myapp/packages/foo/CLAUDE.md", content: "# Foo" }],
      cwd,
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for entries with no path", () => {
    const result = readNativeContextFiles([{ path: undefined, content: "stuff" }], cwd);
    expect(result).toEqual([]);
  });

  it("returns empty array for entries with no content", () => {
    const result = readNativeContextFiles([{ path: "/foo.md", content: undefined }], cwd);
    expect(result).toEqual([]);
  });

  it("returns empty array for mixed inputs", () => {
    const result = readNativeContextFiles(
      [
        { path: "/Users/alice/AGENTS.md", content: "dotfiles" },
        { path: "/Users/alice/projects/myapp/CLAUDE.md", content: "# Root" },
        { path: "/Users/alice/projects/myapp/packages/bar/CLAUDE.md", content: "# Bar" },
      ],
      cwd,
    );
    expect(result).toEqual([]);
  });
});
