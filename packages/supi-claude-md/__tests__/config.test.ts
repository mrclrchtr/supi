import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_MD_DEFAULTS, loadClaudeMdConfig } from "../config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-claude-md-config-test-"));
}

describe("loadClaudeMdConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const config = loadClaudeMdConfig(tmpDir, tmpDir);
    expect(config).toEqual(CLAUDE_MD_DEFAULTS);
  });

  it("merges global config with defaults", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "claude-md": { rereadInterval: 10 } }),
    );

    const config = loadClaudeMdConfig(tmpDir, tmpDir);
    expect(config.rereadInterval).toBe(10);
    expect(config.subdirs).toBe(true); // default
  });

  it("merges project config overriding global", () => {
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
      JSON.stringify({ "claude-md": { subdirs: false } }),
    );

    const config = loadClaudeMdConfig(tmpDir, tmpDir);
    expect(config.rereadInterval).toBe(5); // from global
    expect(config.subdirs).toBe(false); // from project
  });
});
