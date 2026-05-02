import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredContextFile } from "../discovery.ts";
import type { InjectedDir } from "../state.ts";
import type { ContextUsage, InjectionCheckOptions } from "../subdirectory.ts";
import { formatSubdirContext, shouldInjectSubdir } from "../subdirectory.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-subdir-test-"));
}

// biome-ignore lint/security/noSecrets: describe block name, not a secret
describe("shouldInjectSubdir", () => {
  function opts(overrides: Partial<InjectionCheckOptions> = {}): InjectionCheckOptions {
    return {
      injectedDirs: new Map(),
      currentTurn: 1,
      rereadInterval: 3,
      contextThreshold: 80,
      contextUsage: undefined,
      ...overrides,
    };
  }

  it("returns true for never-injected directory", () => {
    expect(shouldInjectSubdir("packages/foo", opts())).toBe(true);
  });

  it("returns false when within interval", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    expect(shouldInjectSubdir("packages/foo", opts({ injectedDirs, currentTurn: 4 }))).toBe(false);
  });

  it("returns true when interval exceeded", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    // turn delta: 5 - 2 = 3 >= 3
    expect(shouldInjectSubdir("packages/foo", opts({ injectedDirs, currentTurn: 5 }))).toBe(true);
  });

  it("returns false when interval is 0 (disabled) but dir was already injected", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    expect(
      shouldInjectSubdir("packages/foo", opts({ injectedDirs, currentTurn: 5, rereadInterval: 0 })),
    ).toBe(false);
  });

  it("returns true for never-injected dir even when interval is 0", () => {
    expect(shouldInjectSubdir("packages/foo", opts({ currentTurn: 5, rereadInterval: 0 }))).toBe(
      true,
    );
  });

  it("returns true at exact boundary", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 3, file: "packages/foo/CLAUDE.md" }],
    ]);

    // turn delta: 6 - 3 = 3 >= 3
    expect(shouldInjectSubdir("packages/foo", opts({ injectedDirs, currentTurn: 6 }))).toBe(true);
  });

  describe("context threshold gating", () => {
    const injectedDirs = new Map<string, InjectedDir>([
      ["packages/foo", { turn: 2, file: "packages/foo/CLAUDE.md" }],
    ]);

    it("always injects first-time directories regardless of context pressure", () => {
      const usage: ContextUsage = { tokens: 150_000, contextWindow: 128_000, percent: 90 };
      expect(
        shouldInjectSubdir("packages/bar", opts({ currentTurn: 5, contextUsage: usage })),
      ).toBe(true);
    });

    it("skips re-injection when context usage >= threshold", () => {
      const usage: ContextUsage = { tokens: 100_000, contextWindow: 128_000, percent: 85 };
      // turn delta: 5 - 2 = 3 >= 3, re-injection would be due
      expect(
        shouldInjectSubdir(
          "packages/foo",
          opts({ injectedDirs, currentTurn: 5, contextUsage: usage }),
        ),
      ).toBe(false);
    });

    it("proceeds with re-injection when context usage < threshold", () => {
      const usage: ContextUsage = { tokens: 50_000, contextWindow: 128_000, percent: 50 };
      expect(
        shouldInjectSubdir(
          "packages/foo",
          opts({ injectedDirs, currentTurn: 5, contextUsage: usage }),
        ),
      ).toBe(true);
    });

    it("proceeds with re-injection when contextUsage.percent is null", () => {
      const usage: ContextUsage = { tokens: null, contextWindow: 128_000, percent: null };
      expect(
        shouldInjectSubdir(
          "packages/foo",
          opts({ injectedDirs, currentTurn: 5, contextUsage: usage }),
        ),
      ).toBe(true);
    });

    it("proceeds with re-injection when contextUsage is undefined", () => {
      expect(shouldInjectSubdir("packages/foo", opts({ injectedDirs, currentTurn: 5 }))).toBe(true);
    });

    it("re-injection at threshold exactly is skipped", () => {
      const usage: ContextUsage = { tokens: 102_400, contextWindow: 128_000, percent: 80 };
      expect(
        shouldInjectSubdir(
          "packages/foo",
          opts({ injectedDirs, currentTurn: 5, contextUsage: usage }),
        ),
      ).toBe(false);
    });

    it("with threshold 100, re-injection proceeds at 100% usage", () => {
      const usage: ContextUsage = { tokens: 128_000, contextWindow: 128_000, percent: 100 };
      expect(
        shouldInjectSubdir(
          "packages/foo",
          opts({
            injectedDirs,
            currentTurn: 5,
            contextThreshold: 100,
            contextUsage: usage,
          }),
        ),
      ).toBe(true);
    });
  });
});

describe("formatSubdirContext", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("formats a single context file", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    fs.writeFileSync(filePath, "This is context for this package.");

    const files: DiscoveredContextFile[] = [
      { absolutePath: filePath, relativePath: "packages/foo/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files, 5);

    expect(result).toContain(
      '<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">',
    );
    expect(result).toContain("This is context for this package.");
    expect(result).toContain("</extension-context>");
  });

  it("formats multiple context files separated by blank lines", () => {
    const file1 = path.join(tmpDir, "a.md");
    const file2 = path.join(tmpDir, "b.md");
    fs.writeFileSync(file1, "Context A");
    fs.writeFileSync(file2, "Context B");

    const files: DiscoveredContextFile[] = [
      { absolutePath: file1, relativePath: "a/CLAUDE.md", dir: tmpDir },
      { absolutePath: file2, relativePath: "b/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files, 3);

    expect(result).toContain("Context A");
    expect(result).toContain("Context B");
    expect(result).toContain('turn="3"');
  });

  it("skips files that cannot be read", () => {
    const files: DiscoveredContextFile[] = [
      {
        absolutePath: "/nonexistent/path/CLAUDE.md",
        relativePath: "missing/CLAUDE.md",
        dir: "/nonexistent/path",
      },
    ];

    const result = formatSubdirContext(files, 1);
    expect(result).toBe("");
  });

  it("skips empty files", () => {
    const filePath = path.join(tmpDir, "empty.md");
    fs.writeFileSync(filePath, "   \n  \n");

    const files: DiscoveredContextFile[] = [
      { absolutePath: filePath, relativePath: "empty/CLAUDE.md", dir: tmpDir },
    ];

    const result = formatSubdirContext(files, 1);
    expect(result).toBe("");
  });
});
