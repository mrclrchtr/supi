import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { extractSearchTargets, initBashParser, shouldSuggestLsp } from "../bash-guard.ts";
import { LspManager } from "../manager.ts";

function makeManager(): LspManager {
  return new LspManager({ servers: {} });
}

beforeAll(async () => {
  await initBashParser();
});

// ── extractSearchTargets ──────────────────────────────────────────────

describe("extractSearchTargets", () => {
  it("extracts file arguments from rg", () => {
    expect(extractSearchTargets('rg "MySymbol" src/foo.ts lib/bar.ts')).toEqual([
      "src/foo.ts",
      "lib/bar.ts",
    ]);
  });

  it("extracts directory argument from grep", () => {
    expect(extractSearchTargets("grep -r 'pattern' openspec/changes/")).toEqual([
      "openspec/changes/",
    ]);
  });

  it("extracts pathspec from git grep", () => {
    expect(extractSearchTargets("git grep 'pattern' -- packages/supi-lsp/")).toEqual([
      "packages/supi-lsp/",
    ]);
  });

  it("returns empty array for bare rg with no path", () => {
    expect(extractSearchTargets('rg "pattern"')).toEqual([]);
  });

  it("returns empty array for unparseable command", () => {
    expect(extractSearchTargets("cat file.txt")).toEqual([]);
  });

  it("skips flags before pattern", () => {
    expect(extractSearchTargets("rg -i -n 'TODO' src/")).toEqual(["src/"]);
  });

  it("skips -e flag and its value", () => {
    expect(extractSearchTargets("rg -e 'pattern' src/ lib/")).toEqual(["lib/"]);
  });

  it("handles long flags with equals", () => {
    expect(extractSearchTargets("rg --max-count=5 'pattern' src/")).toEqual(["src/"]);
  });

  it("preserves raw targets from cd && rg commands", () => {
    expect(extractSearchTargets("cd packages/supi-lsp && rg 'pattern' __tests__/")).toEqual([
      "__tests__/",
    ]);
  });

  it("extracts targets from semicolon-separated commands", () => {
    expect(extractSearchTargets("echo hello; rg 'TODO' src/")).toEqual(["src/"]);
  });

  it("returns empty array for ambiguous shell control flow", () => {
    expect(extractSearchTargets("cd foo || rg 'x' src/")).toEqual([]);
    expect(extractSearchTargets("cd foo && rg 'x' src/ | head")).toEqual([]);
    expect(extractSearchTargets("(cd foo && rg 'x' src/)")).toEqual([]);
  });
});

// ── shouldSuggestLsp ─────────────────────────────────────────────────

describe("shouldSuggestLsp for files", () => {
  it("returns nudge for semantic grep on TypeScript files", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockImplementation((filePath) =>
      filePath.endsWith(".ts"),
    );

    const result = shouldSuggestLsp(
      'rg "MySymbol" packages/supi-lsp/lsp.ts',
      "find all references for MySymbol",
      manager,
    );

    expect(result).toContain("LSP is active");
    expect(result).toContain("lsp tool");
  });

  it("returns null for grep on markdown files even when ts files are supported", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockImplementation((filePath) =>
      filePath.endsWith(".ts"),
    );

    const result = shouldSuggestLsp(
      'rg "pattern" openspec/changes/',
      "find all references for pattern",
      manager,
    );

    expect(result).toBeNull();
  });

  it("returns null for non-semantic prompts", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(true);

    const result = shouldSuggestLsp('rg "TODO" src/', "find TODO comments", manager);
    expect(result).toBeNull();
  });

  it("returns null when no targets can be extracted", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(true);

    const result = shouldSuggestLsp('rg "pattern"', "find all references for pattern", manager);
    expect(result).toBeNull();
  });

  it("returns nudge for mixed targets when at least one is LSP-supported", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockImplementation((filePath) =>
      filePath.endsWith(".ts"),
    );

    const result = shouldSuggestLsp(
      'rg "pattern" src/foo.ts docs/readme.md',
      "find all references for pattern",
      manager,
    );

    expect(result).toContain("LSP is active");
  });

  it("returns null for json files with no json LSP", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockImplementation((filePath) =>
      filePath.endsWith(".ts"),
    );

    const result = shouldSuggestLsp(
      'rg "version" package.json',
      "find the version definition",
      manager,
    );

    expect(result).toBeNull();
  });
});

describe("shouldSuggestLsp for directories and shell control flow", () => {
  it("resolves search targets relative to the tracked cd command", () => {
    const manager = makeManager();
    const root = mkdtempSync(path.join(tmpdir(), "supi-lsp-guard-"));

    try {
      const packageDir = path.join(root, "packages", "supi-lsp");
      const testDir = path.join(packageDir, "__tests__");
      mkdirSync(testDir, { recursive: true });
      writeFileSync(path.join(testDir, "guardrails.test.ts"), "export {};\n");

      const supportedSpy = vi
        .spyOn(manager, "isSupportedSourceFile")
        .mockImplementation((filePath) => filePath.endsWith("guardrails.test.ts"));

      const result = shouldSuggestLsp(
        `cd ${packageDir} && rg 'Foo' __tests__/`,
        "find all references for Foo",
        manager,
      );

      expect(result).toContain("LSP is active");
      expect(result).toContain("__tests__/");
      expect(supportedSpy).toHaveBeenCalledWith(path.join(testDir, "guardrails.test.ts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gates directory nudges through the configured manager", () => {
    const manager = makeManager();
    const root = mkdtempSync(path.join(tmpdir(), "supi-lsp-guard-"));

    try {
      const srcDir = path.join(root, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(path.join(srcDir, "app.ts"), "export const app = 1;\n");

      vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(false);

      const result = shouldSuggestLsp(
        `rg 'Foo' ${srcDir}/`,
        "find all references for Foo",
        manager,
      );

      expect(result).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null for ambiguous control flow around a search", () => {
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(true);

    expect(
      shouldSuggestLsp("cd foo || rg 'x' src/", "find all references for x", manager),
    ).toBeNull();
    expect(
      shouldSuggestLsp("cd foo && rg 'x' src/ | head", "find all references for x", manager),
    ).toBeNull();
    expect(
      shouldSuggestLsp("(cd foo && rg 'x' src/)", "find all references for x", manager),
    ).toBeNull();
  });

  it("stops directory traversal when the nesting depth exceeds the limit", () => {
    const manager = makeManager();
    const root = mkdtempSync(path.join(tmpdir(), "supi-lsp-guard-"));
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const deepDir = path.join(root, "a", "b", "c", "d", "e", "f", "g");
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(path.join(deepDir, "deep.ts"), "export const deep = 1;\n");

      const supportedSpy = vi
        .spyOn(manager, "isSupportedSourceFile")
        .mockImplementation((filePath) => filePath.endsWith("deep.ts"));

      const result = shouldSuggestLsp(
        `rg 'deep' ${path.join(root, "a")}/`,
        "find all references for deep",
        manager,
      );

      expect(result).toBeNull();
      expect(supportedSpy).not.toHaveBeenCalledWith(path.join(deepDir, "deep.ts"));
      expect(stderrWrite).toHaveBeenCalledWith(
        expect.stringContaining("skipped a deep directory subtree"),
      );
    } finally {
      stderrWrite.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops directory traversal after 1000 files", () => {
    const manager = makeManager();
    const root = mkdtempSync(path.join(tmpdir(), "supi-lsp-guard-"));
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      for (let i = 0; i < 1005; i++) {
        writeFileSync(path.join(root, `file-${i}.ts`), `export const value${i} = ${i};\n`);
      }

      const supportedSpy = vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(false);

      const result = shouldSuggestLsp(
        `rg 'value' ${root}/`,
        "find all references for value",
        manager,
      );

      expect(result).toBeNull();
      expect(supportedSpy.mock.calls).toHaveLength(1000);
      expect(stderrWrite).toHaveBeenCalledWith(
        expect.stringContaining("stopped scanning after 1000 files"),
      );
    } finally {
      stderrWrite.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── LspManager stale file pruning (existing tests) ───────────────────

describe("LspManager stale file pruning", () => {
  it("ignores node_modules diagnostics in summaries", () => {
    const manager = new LspManager({ servers: {} });
    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            getAllDiagnostics(): Array<{
              uri: string;
              diagnostics: Array<{ severity?: number; message: string }>;
            }>;
            pruneMissingFiles(): string[];
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${process.cwd()}/node_modules/pkg/index.d.ts`,
          diagnostics: [{ severity: 1, message: "bad dep types" }],
        },
      ],
      pruneMissingFiles: () => [],
    });

    expect(manager.getOutstandingDiagnosticsSummaryText(1)).toBeNull();
  });

  it("prunes missing open files before coverage summaries", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    const fakeClient = {
      name: "typescript-language-server",
      status: "running" as const,
      root: "/tmp/project",
      openFiles: ["/tmp/project/missing.ts"],
      getAllDiagnostics: () => [],
      pruneMissingFiles: vi.fn(() => {
        fakeClient.openFiles = [];
        return ["/tmp/project/missing.ts"];
      }),
      didClose: vi.fn(),
    };

    const clients = (manager as unknown as { clients: Map<string, typeof fakeClient> }).clients;
    clients.set("typescript-language-server:/tmp/project", fakeClient);

    expect(manager.getCoverageSummaryText()).toBeNull();
    expect(fakeClient.pruneMissingFiles).toHaveBeenCalled();
  });

  it("closes files across active clients", () => {
    const manager = new LspManager({ servers: {} });
    const fakeClient = {
      didClose: vi.fn(),
      pruneMissingFiles: () => [],
    };

    const clients = (manager as unknown as { clients: Map<string, typeof fakeClient> }).clients;
    clients.set("fake", fakeClient);

    manager.closeFile("README.md");
    expect(fakeClient.didClose).toHaveBeenCalled();
  });
});
