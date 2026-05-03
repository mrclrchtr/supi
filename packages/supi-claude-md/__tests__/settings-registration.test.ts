import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearRegisteredSettings, getRegisteredSettings } from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerClaudeMdSettings } from "../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-md-settings-test-"));
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

describe("registerClaudeMdSettings", () => {
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

  it("loadValues returns four setting items", () => {
    registerClaudeMdSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");

    expect(items.map((item) => item.id)).toEqual([
      "subdirs",
      "rereadInterval",
      "contextThreshold",
      "fileNames",
    ]);
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
