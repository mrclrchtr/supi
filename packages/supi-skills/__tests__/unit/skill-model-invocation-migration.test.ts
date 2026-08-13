import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyInvocationConfigWarnings,
  persistInvocation,
  resolveInvocation,
} from "../../src/skill-model-invocation.ts";

const tempDirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "supi-skill-model-migration-"));
  tempDirs.push(dir);
  return dir;
}

function writeGlobalConfig(homeDir: string, config: Record<string, unknown>): void {
  const configDir = join(homeDir, ".pi", "agent", "supi");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), `${JSON.stringify(config)}\n`, "utf-8");
}

interface SkillsConfig extends Record<string, unknown> {}
interface ConfigFile {
  skills: SkillsConfig;
}

function readGlobalConfig(homeDir: string): ConfigFile {
  return JSON.parse(
    readFileSync(join(homeDir, ".pi", "agent", "supi", "config.json"), "utf-8"),
  ) as ConfigFile;
}

function resolveGlobal(
  name: string,
  cwd: string,
  homeDir: string,
  sourceDefault = false,
): { disabled: boolean; source: string } {
  return resolveInvocation({
    name,
    sourceDefault,
    scope: "global",
    cwd,
    projectTrusted: false,
    homeDir,
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("skill model invocation config migration", () => {
  it("stores a per-skill record with an explicit schema marker", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir)).toEqual({
      skills: { $schemaVersion: 2, review: { modelInvocation: "disabled" } },
    });
  });

  it("preserves a versioned colliding record without an override", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { $schemaVersion: 2, modelInvocation: { futureOption: "keep" } },
    });

    expect(resolveGlobal("modelInvocation", cwd, homeDir, true)).toEqual({
      disabled: true,
      source: "default",
    });
    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills).toEqual({
      $schemaVersion: 2,
      modelInvocation: { futureOption: "keep" },
      other: { modelInvocation: "enabled" },
    });
  });

  it("migrates a legacy map entry named modelInvocation", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { modelInvocation: { modelInvocation: true, review: false } },
    });

    expect(resolveGlobal("modelInvocation", cwd, homeDir)).toEqual({
      disabled: true,
      source: "global",
    });
    expect(resolveGlobal("review", cwd, homeDir, true)).toEqual({
      disabled: false,
      source: "global",
    });
    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills).toEqual({
      $schemaVersion: 2,
      modelInvocation: { modelInvocation: "disabled" },
      review: { modelInvocation: "enabled" },
      other: { modelInvocation: "enabled" },
    });
  });

  it("keeps an invalid legacy collision ignored during migration", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { modelInvocation: { modelInvocation: "enabled", review: false } },
    });

    expect(resolveGlobal("modelInvocation", cwd, homeDir)).toEqual({
      disabled: false,
      source: "default",
    });
    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills.modelInvocation).toEqual({
      modelInvocation: "enabled",
      $invalidModelInvocation: true,
    });
    expect(resolveGlobal("modelInvocation", cwd, homeDir)).toEqual({
      disabled: false,
      source: "default",
    });
  });

  it("keeps an invalid legacy string invalid after migration", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, { skills: { modelInvocation: { broken: "enabled" } } });

    expect(resolveGlobal("broken", cwd, homeDir)).toEqual({
      disabled: false,
      source: "default",
    });
    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(resolveGlobal("broken", cwd, homeDir)).toEqual({
      disabled: false,
      source: "default",
    });
    expect(readGlobalConfig(homeDir).skills.broken).toEqual({
      modelInvocation: "enabled",
      $invalidModelInvocation: true,
    });
  });

  it("preserves an invalid record value when a legacy fallback exists", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { review: "bad", modelInvocation: { review: true } },
    });

    expect(resolveGlobal("review", cwd, homeDir)).toEqual({ disabled: true, source: "global" });
    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills).toEqual({
      $schemaVersion: 2,
      review: "bad",
      other: { modelInvocation: "enabled" },
      $legacyModelInvocation: { review: true },
    });
    expect(resolveGlobal("review", cwd, homeDir)).toEqual({ disabled: true, source: "global" });
  });

  it("migrates valid and invalid legacy entries on the next write", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { modelInvocation: { review: true, authoring: false, broken: "later" } },
    });

    persistInvocation({ name: "new-skill", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir)).toEqual({
      skills: {
        $schemaVersion: 2,
        review: { modelInvocation: "disabled" },
        authoring: { modelInvocation: "enabled" },
        broken: { modelInvocation: "later", $invalidModelInvocation: true },
        "new-skill": { modelInvocation: "enabled" },
      },
    });
  });

  it("unsets a legacy-only override instead of leaving the migrated value", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, { skills: { modelInvocation: { review: true } } });

    persistInvocation({ name: "review", disabled: undefined, scope: "global", cwd, homeDir });

    expect(resolveGlobal("review", cwd, homeDir)).toEqual({
      disabled: false,
      source: "default",
    });
    expect(readGlobalConfig(homeDir)).toEqual({ skills: { $schemaVersion: 2 } });
  });

  it("uses a legacy value when a new record has no override and migrates it", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { review: { futureOption: "keep" }, modelInvocation: { review: true } },
    });

    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills).toEqual({
      $schemaVersion: 2,
      review: { futureOption: "keep", modelInvocation: "disabled" },
      other: { modelInvocation: "enabled" },
    });
  });

  it("preserves an invalid new value and its legacy fallback", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: {
        review: { modelInvocation: "invalid", futureOption: "keep" },
        modelInvocation: { review: true },
      },
    });

    persistInvocation({ name: "other", disabled: false, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir).skills).toEqual({
      $schemaVersion: 2,
      review: { modelInvocation: "invalid", futureOption: "keep" },
      other: { modelInvocation: "enabled" },
      $legacyModelInvocation: { review: true },
    });
  });

  it("removes only the selected override and keeps other record fields", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { review: { modelInvocation: "disabled", futureOption: "keep" } },
    });

    persistInvocation({ name: "review", disabled: undefined, scope: "global", cwd, homeDir });

    expect(readGlobalConfig(homeDir)).toEqual({
      skills: { $schemaVersion: 2, review: { futureOption: "keep" } },
    });
  });

  it("warns once per invalid config file in one session", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    writeGlobalConfig(homeDir, {
      skills: { review: { modelInvocation: "invalid" }, other: { modelInvocation: 3 } },
    });
    const notify = vi.fn();
    const ctx = makeCtx({
      cwd,
      hasUI: true,
      isProjectTrusted: () => false,
      sessionManager: { getSessionId: () => "skill-warning-session" },
      ui: { ...makeCtx().ui, notify },
    });

    notifyInvocationConfigWarnings(ctx as never, homeDir);
    notifyInvocationConfigWarnings(ctx as never, homeDir);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("other, review"), "warning");
  });
});
