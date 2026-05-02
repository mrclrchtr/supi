import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASH_TIMEOUT_DEFAULTS, loadBashTimeoutConfig } from "../config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-bash-timeout-config-test-"));
}

// biome-ignore lint/security/noSecrets: false positive — test description
describe("loadBashTimeoutConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config).toEqual(BASH_TIMEOUT_DEFAULTS);
  });

  it("loads configured global value", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(300);
  });

  it("loads configured project value", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 60 } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(60);
  });

  it("merges project config overriding global", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 60 } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(60);
  });

  it("falls back to default for non-numeric value", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: "not-a-number" } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(120);
  });

  it("falls back to default for zero value", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 0 } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(120);
  });

  it("falls back to default for negative value", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: -10 } }),
    );

    const config = loadBashTimeoutConfig(tmpDir, tmpDir);
    expect(config.defaultTimeout).toBe(120);
  });
});
