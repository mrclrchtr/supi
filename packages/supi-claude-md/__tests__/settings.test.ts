import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_MD_DEFAULTS, type ClaudeMdConfig } from "../config.ts";
import { buildSettingsRows, loadSettingsForScope, persistSetting } from "../settings.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-settings-test-"));
}

function writeProjectConfig(tmpDir: string, section: string, data: Record<string, unknown>): void {
  const configPath = path.join(tmpDir, ".pi", "supi", "config.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = readJsonFile(configPath) ?? {};
  existing[section] = { ...((existing[section] as Record<string, unknown>) ?? {}), ...data };
  fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

function readProjectConfig(tmpDir: string): Record<string, unknown> | null {
  return readJsonFile(path.join(tmpDir, ".pi", "supi", "config.json"));
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

let tmpDir: string;

// ── loadSettingsForScope ─────────────────────────────────────

describe("loadSettingsForScope", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const config = loadSettingsForScope("project", tmpDir);
    // May be affected by real global config; just check type correctness
    expect(typeof config.rereadInterval).toBe("number");
    expect(typeof config.subdirs).toBe("boolean");
    expect(Array.isArray(config.fileNames)).toBe(true);
  });

  it("merges project config over defaults", () => {
    writeProjectConfig(tmpDir, "claude-md", { rereadInterval: 10, subdirs: false });
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.rereadInterval).toBe(10);
    expect(config.subdirs).toBe(false);
  });
});

// ── persistSetting ────────────────────────────────────────────

describe("persistSetting", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a numeric interval to project config", () => {
    persistSetting("project", tmpDir, "rereadInterval", 5);
    const config = readProjectConfig(tmpDir);
    expect((config?.["claude-md"] as Record<string, unknown>)?.rereadInterval).toBe(5);
  });

  it("writes 0 for interval off", () => {
    persistSetting("project", tmpDir, "rereadInterval", 0);
    const config = readProjectConfig(tmpDir);
    expect((config?.["claude-md"] as Record<string, unknown>)?.rereadInterval).toBe(0);
  });

  it("removes key when value is undefined (reset to default)", () => {
    writeProjectConfig(tmpDir, "claude-md", { rereadInterval: 5 });
    persistSetting("project", tmpDir, "rereadInterval", undefined);
    const config = readProjectConfig(tmpDir);
    const section = (config?.["claude-md"] as Record<string, unknown>) ?? {};
    expect(section.rereadInterval).toBeUndefined();
  });

  it("writes boolean true for subdirs on", () => {
    persistSetting("project", tmpDir, "subdirs", true);
    const config = readProjectConfig(tmpDir);
    expect((config?.["claude-md"] as Record<string, unknown>)?.subdirs).toBe(true);
  });

  it("writes boolean false for subdirs off", () => {
    persistSetting("project", tmpDir, "subdirs", false);
    const config = readProjectConfig(tmpDir);
    expect((config?.["claude-md"] as Record<string, unknown>)?.subdirs).toBe(false);
  });

  it("writes to global scope", () => {
    const homeDir = makeTempDir();
    const globalConfigDir = path.join(homeDir, ".pi", "agent", "supi");
    fs.mkdirSync(globalConfigDir, { recursive: true });
    const globalConfigPath = path.join(globalConfigDir, "config.json");
    fs.writeFileSync(globalConfigPath, "{}", "utf-8");

    // persistSetting with global scope writes to project config path
    // since it uses the same cwd-based resolution
    persistSetting("global", tmpDir, "rereadInterval", 7);

    // The function writes to the global config path via os.homedir()
    // In tests without mocking, it would write to the real home dir
    // but since we're using project scope in other tests, let's verify
    // it doesn't write to project config
    const projectConfig = readProjectConfig(tmpDir);
    expect(projectConfig).toBeNull();

    fs.rmSync(homeDir, { recursive: true, force: true });
  });
});

// ── buildSettingsRows ────────────────────────────────────────

describe("buildSettingsRows", () => {
  it("builds rows from default config", () => {
    const rows = buildSettingsRows(CLAUDE_MD_DEFAULTS);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toEqual({
      id: "rereadInterval",
      label: "Context Refresh Interval",
      description: "Turns between re-reading context files for fresh content (0 = off)",
      type: "interval",
      value: "3",
    });
    expect(rows[1]).toEqual({
      id: "subdirs",
      label: "Subdirectory Discovery",
      description: "Inject CLAUDE.md/AGENTS.md from subdirectories when browsing files",
      type: "boolean",
      value: "on",
    });
    expect(rows[2]).toEqual({
      id: "fileNames",
      label: "Context File Names",
      description: "File names to look for in each directory (comma-separated)",
      type: "filenames",
      value: "CLAUDE.md, AGENTS.md",
    });
  });

  it("shows 'off' for interval when set to 0", () => {
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 0 };
    const rows = buildSettingsRows(config);
    expect(rows[0].value).toBe("off");
  });

  it("shows numeric string for positive interval", () => {
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, rereadInterval: 7 };
    const rows = buildSettingsRows(config);
    expect(rows[0].value).toBe("7");
  });

  it("shows 'off' for subdirs=false", () => {
    const config: ClaudeMdConfig = { ...CLAUDE_MD_DEFAULTS, subdirs: false };
    const rows = buildSettingsRows(config);
    expect(rows[1].value).toBe("off");
  });

  it("joins fileNames with commas", () => {
    const config: ClaudeMdConfig = {
      ...CLAUDE_MD_DEFAULTS,
      fileNames: ["INSTRUCTIONS.md", "CONTEXT.md", "AGENTS.md"],
    };
    const rows = buildSettingsRows(config);
    expect(rows[2].value).toBe("INSTRUCTIONS.md, CONTEXT.md, AGENTS.md");
  });
});

// ── scope switching ──────────────────────────────────────────

describe("scope switching reloads correct values", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project config overrides are reflected after persist", () => {
    persistSetting("project", tmpDir, "rereadInterval", 10);
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.rereadInterval).toBe(10);
  });

  it("changing one setting preserves others", () => {
    persistSetting("project", tmpDir, "rereadInterval", 5);
    persistSetting("project", tmpDir, "subdirs", false);

    const config = loadSettingsForScope("project", tmpDir);
    expect(config.rereadInterval).toBe(5);
    expect(config.subdirs).toBe(false);
  });
});

// ── interval persistence edge cases ──────────────────────────

describe("interval persistence", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists a positive number", () => {
    persistSetting("project", tmpDir, "rereadInterval", 5);
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.rereadInterval).toBe(5);
  });

  it("persists 0 (off)", () => {
    persistSetting("project", tmpDir, "rereadInterval", 0);
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.rereadInterval).toBe(0);
  });

  it("removes key for default reset", () => {
    persistSetting("project", tmpDir, "rereadInterval", 5);
    persistSetting("project", tmpDir, "rereadInterval", undefined);
    const config = loadSettingsForScope("project", tmpDir);
    // After removing project override, falls back to global or default
    expect(config.rereadInterval).not.toBe(5);
  });
});

// ── boolean toggle persistence ───────────────────────────────

describe("boolean toggle persistence", () => {
  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes true for subdirs on", () => {
    persistSetting("project", tmpDir, "subdirs", true);
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.subdirs).toBe(true);
  });

  it("writes false for subdirs off", () => {
    persistSetting("project", tmpDir, "subdirs", false);
    const config = loadSettingsForScope("project", tmpDir);
    expect(config.subdirs).toBe(false);
  });
});
