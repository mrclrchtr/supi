import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  loadSupiConfig,
} from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_MD_DEFAULTS } from "../config.ts";
import { registerClaudeMdSettings } from "../settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-md-settings-test-"));
}

const opts = (dir: string) => ({ homeDir: dir });

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

function loadClaudeMdConfigForTest(dir: string) {
  return loadSupiConfig("claude-md", dir, CLAUDE_MD_DEFAULTS, opts(dir));
}

describe("registerClaudeMdSettings: registration", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers a Claude-MD settings section", () => {
    registerClaudeMdSettings();
    const sections = getRegisteredSettings();

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "claude-md", label: "Claude-MD" });
  });

  it("loadValues returns four Claude-MD settings with current defaults", () => {
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");

    expect(items.map((item) => item.id)).toEqual([
      "subdirs",
      "rereadInterval",
      "contextThreshold",
      "fileNames",
    ]);
    expect(items.find((item) => item.id === "subdirs")).toMatchObject({
      currentValue: "on",
      values: ["on", "off"],
    });
    expect(items.find((item) => item.id === "rereadInterval")).toMatchObject({
      currentValue: "3",
      submenu: expect.any(Function),
    });
    expect(items.find((item) => item.id === "contextThreshold")).toMatchObject({
      currentValue: "80",
      values: expect.arrayContaining(["0", "80", "100"]),
    });
    expect(items.find((item) => item.id === "fileNames")).toMatchObject({
      currentValue: "CLAUDE.md, AGENTS.md",
      submenu: expect.any(Function),
    });
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({
        "claude-md": {
          subdirs: false,
          rereadInterval: 7,
          contextThreshold: 90,
          fileNames: ["GLOBAL.md"],
        },
      }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({
        "claude-md": {
          subdirs: true,
          rereadInterval: 2,
          contextThreshold: 70,
          fileNames: ["PROJECT.md"],
        },
      }),
    );

    withHomeDir(tmpDir, () => {
      registerClaudeMdSettings();
      const section = getRegisteredSettings()[0];

      const globalItems = section.loadValues("global", tmpDir);
      const projectItems = section.loadValues("project", tmpDir);

      expect(globalItems.find((item) => item.id === "subdirs")?.currentValue).toBe("off");
      expect(globalItems.find((item) => item.id === "rereadInterval")?.currentValue).toBe("7");
      expect(globalItems.find((item) => item.id === "contextThreshold")?.currentValue).toBe("90");
      expect(globalItems.find((item) => item.id === "fileNames")?.currentValue).toBe("GLOBAL.md");

      expect(projectItems.find((item) => item.id === "subdirs")?.currentValue).toBe("on");
      expect(projectItems.find((item) => item.id === "rereadInterval")?.currentValue).toBe("2");
      expect(projectItems.find((item) => item.id === "contextThreshold")?.currentValue).toBe("70");
      expect(projectItems.find((item) => item.id === "fileNames")?.currentValue).toBe("PROJECT.md");
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project scope falls back to defaults when only global config exists", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({
        "claude-md": {
          rereadInterval: 9,
          contextThreshold: 95,
          fileNames: ["GLOBAL.md"],
        },
      }),
    );

    withHomeDir(tmpDir, () => {
      registerClaudeMdSettings();
      const section = getRegisteredSettings()[0];
      const projectItems = section.loadValues("project", tmpDir);

      expect(projectItems.find((item) => item.id === "subdirs")?.currentValue).toBe("on");
      expect(projectItems.find((item) => item.id === "rereadInterval")?.currentValue).toBe("3");
      expect(projectItems.find((item) => item.id === "contextThreshold")?.currentValue).toBe("80");
      expect(projectItems.find((item) => item.id === "fileNames")?.currentValue).toBe(
        "CLAUDE.md, AGENTS.md",
      );
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("registerClaudeMdSettings: persistence", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("persistChange writes subdirs on and off", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "subdirs", "off");
    expect(loadClaudeMdConfigForTest(tmpDir).subdirs).toBe(false);

    section.persistChange("project", tmpDir, "subdirs", "on");
    expect(loadClaudeMdConfigForTest(tmpDir).subdirs).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes rereadInterval numbers", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "rereadInterval", "5");

    expect(loadClaudeMdConfigForTest(tmpDir).rereadInterval).toBe(5);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes rereadInterval off as 0", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "rereadInterval", "0");

    expect(loadClaudeMdConfigForTest(tmpDir).rereadInterval).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes contextThreshold to config", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "contextThreshold", "95");

    expect(loadClaudeMdConfigForTest(tmpDir).contextThreshold).toBe(95);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes fileNames to config", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "fileNames", "CLAUDE.md, AGENTS.md, NOTES.md");

    expect(loadClaudeMdConfigForTest(tmpDir).fileNames).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      "NOTES.md",
    ]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange removes fileNames when the input is empty", () => {
    const tmpDir = makeTempDir();
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "fileNames", "NOTES.md");
    section.persistChange("project", tmpDir, "fileNames", "");

    expect(loadClaudeMdConfigForTest(tmpDir).fileNames).toEqual(CLAUDE_MD_DEFAULTS.fileNames);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists to the selected global scope without changing project defaults", () => {
    const tmpDir = makeTempDir();

    withHomeDir(tmpDir, () => {
      registerClaudeMdSettings();
      const section = getRegisteredSettings()[0];

      section.persistChange("global", tmpDir, "subdirs", "off");

      const globalItems = section.loadValues("global", tmpDir);
      const projectItems = section.loadValues("project", tmpDir);

      expect(globalItems.find((item) => item.id === "subdirs")?.currentValue).toBe("off");
      expect(projectItems.find((item) => item.id === "subdirs")?.currentValue).toBe("on");
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
