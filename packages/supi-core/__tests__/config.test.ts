import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadSupiConfig,
  loadSupiConfigForScope,
  removeSupiConfigKey,
  writeSupiConfig,
} from "../src/config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-core-config-test-"));
}

const opts = (dir: string) => ({ homeDir: dir });

describe("loadSupiConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config files exist", () => {
    const result = loadSupiConfig(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      opts(tmpDir),
    );
    expect(result).toEqual({ rereadInterval: 3, subdirs: true });
  });

  it("loads global config", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 5 } }),
    );

    const result = loadSupiConfig(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      opts(tmpDir),
    );
    expect(result).toEqual({ rereadInterval: 5, subdirs: true });
  });

  it("loads project config", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "claude-md": { subdirs: false } }),
    );

    const result = loadSupiConfig(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      opts(tmpDir),
    );
    expect(result).toEqual({ rereadInterval: 3, subdirs: false });
  });

  it("merges global and project config (project overrides global)", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 5, subdirs: true } }),
    );

    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 10 } }),
    );

    const result = loadSupiConfig(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      opts(tmpDir),
    );
    expect(result).toEqual({ rereadInterval: 10, subdirs: true });
  });

  it("falls back to defaults for malformed global JSON", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, "config.json"), "not json{{{");

    const result = loadSupiConfig("claude-md", tmpDir, { rereadInterval: 3 }, opts(tmpDir));
    expect(result).toEqual({ rereadInterval: 3 });
  });

  it("ignores non-object config (array)", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "config.json"), "[1,2,3]");

    const result = loadSupiConfig("claude-md", tmpDir, { rereadInterval: 3 }, opts(tmpDir));
    expect(result).toEqual({ rereadInterval: 3 });
  });

  it("returns defaults when section is missing", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "other-ext": { foo: "bar" } }),
    );

    const result = loadSupiConfig("claude-md", tmpDir, { rereadInterval: 3 }, opts(tmpDir));
    expect(result).toEqual({ rereadInterval: 3 });
  });
});

describe("scope-aware config loading", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads only global config for global scope", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 5 } }),
    );

    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 10 } }),
    );

    const result = loadSupiConfigForScope(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      { scope: "global", ...opts(tmpDir) },
    );
    expect(result).toEqual({ rereadInterval: 5, subdirs: true });
  });

  it("loads only project config for project scope", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 5 } }),
    );

    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 10 } }),
    );

    const result = loadSupiConfigForScope(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      { scope: "project", ...opts(tmpDir) },
    );
    expect(result).toEqual({ rereadInterval: 10, subdirs: true });
  });
});

describe("writeSupiConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory and file if they don't exist", () => {
    writeSupiConfig({ section: "claude-md", scope: "project", cwd: tmpDir }, { rereadInterval: 5 });

    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(content["claude-md"]).toEqual({ rereadInterval: 5 });
  });

  it("writes to global config", () => {
    writeSupiConfig(
      { section: "claude-md", scope: "global", cwd: tmpDir },
      { rereadInterval: 5 },
      opts(tmpDir),
    );

    const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(content["claude-md"]).toEqual({ rereadInterval: 5 });
  });

  it("merges with existing config", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "other-ext": { foo: "bar" }, "claude-md": { subdirs: true } }),
    );

    writeSupiConfig({ section: "claude-md", scope: "project", cwd: tmpDir }, { rereadInterval: 5 });

    const content = JSON.parse(fs.readFileSync(path.join(projectDir, "config.json"), "utf-8"));
    expect(content["other-ext"]).toEqual({ foo: "bar" });
    expect(content["claude-md"]).toEqual({ subdirs: true, rereadInterval: 5 });
  });
});

describe("removeSupiConfigKey", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes a key from project config", () => {
    writeSupiConfig(
      { section: "claude-md", scope: "project", cwd: tmpDir },
      { rereadInterval: 5, subdirs: false },
    );

    removeSupiConfigKey({ section: "claude-md", scope: "project", cwd: tmpDir }, "rereadInterval");

    const result = loadSupiConfig(
      "claude-md",
      tmpDir,
      { rereadInterval: 3, subdirs: true },
      opts(tmpDir),
    );
    expect(result).toEqual({ rereadInterval: 3, subdirs: false });
  });

  it("removes empty section and file", () => {
    writeSupiConfig({ section: "claude-md", scope: "project", cwd: tmpDir }, { rereadInterval: 5 });

    removeSupiConfigKey({ section: "claude-md", scope: "project", cwd: tmpDir }, "rereadInterval");

    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("no-ops when config file doesn't exist", () => {
    expect(() =>
      removeSupiConfigKey(
        { section: "claude-md", scope: "project", cwd: tmpDir },
        "rereadInterval",
      ),
    ).not.toThrow();
  });
});
