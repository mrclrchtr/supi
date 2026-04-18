import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getArgumentCompletions, handleCommand } from "../commands.ts";
import { createInitialState } from "../state.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-command-test-"));
}

function makeCtx(tmpDir: string) {
  const notify = vi.fn();
  return {
    cwd: tmpDir,
    ui: { notify },
  };
}

function readProjectConfig(tmpDir: string): Record<string, unknown> | null {
  const configPath = path.join(tmpDir, ".pi", "supi", "config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

let tmpDir: string;

describe("handleCommand: status", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults to status when invoked with no arguments", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("", ctx as never, createInitialState());

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("**supi-claude-md status**"),
      "info",
    );
  });

  it("shows status with explicit 'status' subcommand", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("status", ctx as never, createInitialState());

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("**supi-claude-md status**"),
      "info",
    );
  });

  it("status includes config values and state", () => {
    const ctx = makeCtx(tmpDir);
    const state = createInitialState();
    state.completedTurns = 7;
    state.lastRefreshTurn = 4;
    state.injectedDirs.set("packages/foo", { turn: 5, file: "packages/foo/CLAUDE.md" });

    handleCommand("status", ctx as never, state);

    const call = ctx.ui.notify.mock.calls[0];
    expect(call[0]).toContain("completedTurns: 7");
    expect(call[0]).toContain("lastRefreshTurn: 4");
    expect(call[0]).toContain("injectedDirs: 1");
  });

  it("status handles null state gracefully", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("status", ctx as never, null);

    const call = ctx.ui.notify.mock.calls[0];
    expect(call[0]).toContain("completedTurns: N/A");
    expect(call[0]).toContain("injectedDirs: 0");
  });
});

describe("handleCommand: refresh", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sets needsRefresh flag on refresh subcommand", () => {
    const ctx = makeCtx(tmpDir);
    const state = createInitialState();
    state.needsRefresh = false;

    handleCommand("refresh", ctx as never, state);

    expect(state.needsRefresh).toBe(true);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Root context will be refreshed on the next prompt.",
      "info",
    );
  });

  it("refresh works with null state (no crash)", () => {
    const ctx = makeCtx(tmpDir);
    expect(() => handleCommand("refresh", ctx as never, null)).not.toThrow();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Root context will be refreshed on the next prompt.",
      "info",
    );
  });
});

describe("handleCommand: list", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports no subdirectory files when none exist", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("list", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith("No subdirectory context files found.", "info");
  });

  it("discovers subdirectory context files", () => {
    const ctx = makeCtx(tmpDir);
    const subDir = path.join(tmpDir, "packages", "foo");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "CLAUDE.md"), "# Foo package", "utf-8");
    fs.writeFileSync(path.join(subDir, "index.ts"), "export {};", "utf-8");

    handleCommand("list", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("packages/foo/CLAUDE.md"),
      "info",
    );
  });

  it("skips dot directories and node_modules in list", () => {
    const ctx = makeCtx(tmpDir);
    const hiddenDir = path.join(tmpDir, ".hidden");
    const nodeModulesDir = path.join(tmpDir, "node_modules", "pkg");
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(path.join(hiddenDir, "CLAUDE.md"), "hidden", "utf-8");
    fs.writeFileSync(path.join(nodeModulesDir, "CLAUDE.md"), "nm", "utf-8");

    handleCommand("list", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith("No subdirectory context files found.", "info");
  });
});

describe("handleCommand: interval", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sets interval to a number (project scope)", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval 5", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ rereadInterval: 5 });
    expect(ctx.ui.notify).toHaveBeenCalledWith("rereadInterval set to 5 (scope: project)", "info");
  });

  it("sets interval to off", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval off", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ rereadInterval: 0 });
  });

  it("removes interval override with 'default'", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval 5", ctx as never, null);
    expect(readProjectConfig(tmpDir)?.["claude-md"]).toEqual({ rereadInterval: 5 });

    handleCommand("interval default", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    const section = (config?.["claude-md"] as Record<string, unknown>) ?? {};
    expect(section.rereadInterval).toBeUndefined();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "rereadInterval reset to default (scope: project)",
      "info",
    );
  });

  it("writes to global scope with --global flag", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("--global interval 7", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith("rereadInterval set to 7 (scope: global)", "info");
  });

  it("shows usage when interval called without value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Usage: /supi-claude-md interval <N|off|default>",
      "warning",
    );
  });

  it("rejects invalid interval value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval abc", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Invalid interval. Use a positive number, 'off', or 'default'.",
      "warning",
    );
  });

  it("rejects negative interval value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("interval -1", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Invalid interval. Use a positive number, 'off', or 'default'.",
      "warning",
    );
  });
});

describe("handleCommand: subdirs", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enables subdirs", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("subdirs on", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ subdirs: true });
  });

  it("disables subdirs", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("subdirs off", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ subdirs: false });
  });

  it("shows usage for subdirs without value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("subdirs", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Usage: /supi-claude-md subdirs <on|off>",
      "warning",
    );
  });

  it("shows usage for subdirs with invalid value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("subdirs maybe", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Usage: /supi-claude-md subdirs <on|off>",
      "warning",
    );
  });
});

describe("handleCommand: compact", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enables compact", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("compact on", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ compactRefresh: true });
  });

  it("disables compact", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("compact off", ctx as never, null);

    const config = readProjectConfig(tmpDir);
    expect(config?.["claude-md"]).toEqual({ compactRefresh: false });
  });

  it("shows usage for compact without value", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("compact", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Usage: /supi-claude-md compact <on|off>",
      "warning",
    );
  });
});

describe("handleCommand: unknown", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("warns on unknown subcommand", () => {
    const ctx = makeCtx(tmpDir);
    handleCommand("foobar", ctx as never, null);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Unknown subcommand: foobar", "warning");
  });
});

describe("getArgumentCompletions", () => {
  it("returns matching subcommands for prefix", () => {
    const result = getArgumentCompletions("st");
    expect(result).not.toBeNull();
    expect(result?.map((c) => c.value)).toEqual(["status"]);
  });

  it("returns all subcommands for empty prefix", () => {
    const result = getArgumentCompletions("");
    expect(result).not.toBeNull();
    expect(result?.length).toBe(6);
    const values = result?.map((c) => c.value);
    expect(values).toContain("status");
    expect(values).toContain("refresh");
    expect(values).toContain("list");
    expect(values).toContain("interval");
    expect(values).toContain("subdirs");
    expect(values).toContain("compact");
  });

  it("returns null for no matching prefix", () => {
    const result = getArgumentCompletions("zzz");
    expect(result).toBeNull();
  });

  it("includes descriptions for each subcommand", () => {
    const result = getArgumentCompletions("");
    for (const item of result ?? []) {
      expect(item.description).toBeTruthy();
    }
  });
});
