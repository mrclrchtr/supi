import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearRegisteredSettings, getRegisteredSettings } from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerBashTimeoutSettings } from "../settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bash-timeout-settings-test-"));
}

function withHomeDir<T>(homeDir: string, run: () => T): T {
  const prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return run();
  } finally {
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
  }
}

describe("registerBashTimeoutSettings", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers a bash-timeout settings section", () => {
    registerBashTimeoutSettings();
    const sections = getRegisteredSettings();

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "bash-timeout", label: "Bash Timeout" });
  });

  it("loadValues returns one setting item", () => {
    registerBashTimeoutSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "defaultTimeout",
      label: "Default Timeout",
      currentValue: "120",
    });
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 60 } }),
    );

    withHomeDir(tmpDir, () => {
      registerBashTimeoutSettings();
      const section = getRegisteredSettings()[0];

      const globalItems = section.loadValues("global", tmpDir);
      const projectItems = section.loadValues("project", tmpDir);

      expect(globalItems[0]?.currentValue).toBe("300");
      expect(projectItems[0]?.currentValue).toBe("60");
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project scope falls back to defaults when only global config exists", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    withHomeDir(tmpDir, () => {
      registerBashTimeoutSettings();
      const section = getRegisteredSettings()[0];
      const projectItems = section.loadValues("project", tmpDir);

      expect(projectItems[0]?.currentValue).toBe("120");
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes positive numeric value", () => {
    const tmpDir = makeTempDir();

    withHomeDir(tmpDir, () => {
      registerBashTimeoutSettings();
      const section = getRegisteredSettings()[0];
      section.persistChange("global", tmpDir, "defaultTimeout", "300");

      const config = JSON.parse(
        fs.readFileSync(path.join(tmpDir, ".pi/agent/supi/config.json"), "utf-8"),
      );
      expect(config["bash-timeout"].defaultTimeout).toBe(300);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange unsets key for invalid value", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    withHomeDir(tmpDir, () => {
      registerBashTimeoutSettings();
      const section = getRegisteredSettings()[0];
      section.persistChange("global", tmpDir, "defaultTimeout", "not-a-number");

      const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
      const fileExists = fs.existsSync(configPath);
      if (fileExists) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        expect(config["bash-timeout"]).toBeUndefined();
      }
      // If file does not exist, the section was empty and got cleaned up — also valid.
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
