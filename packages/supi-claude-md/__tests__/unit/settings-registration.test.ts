import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsSection } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerClaudeMdSettings } from "../../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-md-settings-test-"));
}

function makePi() {
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on: vi.fn((_channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(SUPI_SETTINGS_COLLECT_EVENT) ?? [];
        list.push(handler);
        eventHandlers.set(SUPI_SETTINGS_COLLECT_EVENT, list);
        return () => void 0;
      }),
      emit: vi.fn((channel: string, data: unknown) => {
        for (const handler of eventHandlers.get(channel) ?? []) handler(data);
      }),
    },
    on: vi.fn(),
  };
}

function collect(pi: ReturnType<typeof makePi>): SettingsSection {
  let captured: SettingsSection | undefined;
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add(s: SettingsSection) {
      captured = s;
    },
  });
  return captured!;
}

const testFiles: string[] = [];

afterEach(() => {
  for (const d of testFiles) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  }
  testFiles.length = 0;
});

describe("registerClaudeMdSettings", () => {
  it("registers a Claude-MD settings section", () => {
    const pi = makePi();
    registerClaudeMdSettings(pi as never);
    const section = collect(pi);

    expect(section).toMatchObject({ id: "claude-md", label: "Claude-MD" });
  });

  it("loadValues returns two setting items", () => {
    const pi = makePi();
    registerClaudeMdSettings(pi as never);
    const section = collect(pi);
    const items = section.loadValues("project", "/tmp");

    expect(items.map((item) => item.id)).toEqual(["subdirs", "fileNames"]);
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({
        "claude-md": {
          subdirs: false,
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
          fileNames: ["PROJECT.md"],
        },
      }),
    );

    const pi = makePi();
    registerClaudeMdSettings(pi as never, tmpDir);
    const section = collect(pi);

    const globalItems = section.loadValues("global", tmpDir);
    const projectItems = section.loadValues("project", tmpDir);

    expect(globalItems.find((item) => item.id === "subdirs")?.currentValue).toBe("off");
    expect(globalItems.find((item) => item.id === "fileNames")?.currentValue).toBe("GLOBAL.md");

    expect(projectItems.find((item) => item.id === "subdirs")?.currentValue).toBe("on");
    expect(projectItems.find((item) => item.id === "fileNames")?.currentValue).toBe("PROJECT.md");
  });

  it("project scope falls back to defaults when only global config exists", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({
        "claude-md": {
          fileNames: ["GLOBAL.md"],
        },
      }),
    );

    const pi = makePi();
    registerClaudeMdSettings(pi as never, tmpDir);
    const section = collect(pi);
    const projectItems = section.loadValues("project", tmpDir);

    expect(projectItems.find((item) => item.id === "subdirs")?.currentValue).toBe("on");
    expect(projectItems.find((item) => item.id === "fileNames")?.currentValue).toBe(
      "CLAUDE.md, AGENTS.md",
    );
  });
});
