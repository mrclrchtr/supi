import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsSection } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODE_INTELLIGENCE_DEFAULTS,
  loadCodeIntelligenceConfig,
  registerCodeIntelligenceSettings,
} from "../../src/config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-config-test-"));
}

function makePi() {
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on: vi.fn((channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(channel) ?? [];
        list.push(handler);
        eventHandlers.set(channel, list);
        return () => void 0;
      }),
      emit: vi.fn((channel: string, data: unknown) => {
        for (const handler of eventHandlers.get(channel) ?? []) handler(data);
      }),
    },
    on: vi.fn(),
  };
}

function collectSection(pi: ReturnType<typeof makePi>): SettingsSection {
  let captured: SettingsSection | undefined;
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add(section: SettingsSection) {
      captured = section;
    },
  });
  expect(captured).toBeDefined();
  return captured as SettingsSection;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

describe("CodeIntelligenceConfig", () => {
  it("uses default instruction file names", () => {
    expect(CODE_INTELLIGENCE_DEFAULTS).toEqual({
      instructionFileNames: ["CLAUDE.md", "AGENTS.md"],
    });
  });

  it("loads code-intelligence.instructionFileNames from project config", () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": { instructionFileNames: ["RULES.md"] } }),
    );

    expect(loadCodeIntelligenceConfig(tmpDir, tmpDir).instructionFileNames).toEqual(["RULES.md"]);
  });
});

describe("registerCodeIntelligenceSettings", () => {
  it("registers a code-intelligence settings section", () => {
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never);

    const section = collectSection(pi);

    expect(section).toMatchObject({ id: "code-intelligence", label: "Code Intelligence" });
  });

  it("loads instructionFileNames as a declarative field with default source", () => {
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never);

    const section = collectSection(pi);
    const values = section.loadValues("project", "/tmp");

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      field: { kind: "stringList", key: "instructionFileNames" },
      source: "default",
    });
  });

  it("persists instructionFileNames via handleAction", () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never, tmpDir);

    const section = collectSection(pi);
    section.handleAction("project", tmpDir, "instructionFileNames", {
      kind: "set",
      value: "RULES.md, NOTES.md",
    });

    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi/supi/config.json"), "utf-8"));
    expect(raw["code-intelligence"].instructionFileNames).toEqual(["RULES.md", "NOTES.md"]);
  });
});
