import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSkillsForPrompt, type Skill } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPromptOverrides,
  persistInvocation,
  resolveInvocation,
} from "../../src/skill-model-invocation.ts";

const tempDirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "supi-skill-model-"));
  tempDirs.push(dir);
  return dir;
}

function skill(disableModelInvocation = false): Skill {
  return {
    name: "review",
    description: "Review code",
    filePath: "/skills/review/SKILL.md",
    baseDir: "/skills/review",
    sourceInfo: {
      path: "/skills/review/SKILL.md",
      source: "test",
      scope: "user",
      origin: "top-level",
    },
    disableModelInvocation,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("skill model invocation", () => {
  it("does not treat inherited object properties as overrides", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");

    expect(
      resolveInvocation({
        name: "constructor",
        sourceDefault: false,
        scope: "project",
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toEqual({ disabled: false, source: "default" });
  });

  it("persists a __proto__ skill preference as data", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    persistInvocation({ name: "__proto__", disabled: true, scope: "global", cwd, homeDir });

    expect(
      resolveInvocation({
        name: "__proto__",
        sourceDefault: false,
        scope: "global",
        cwd,
        projectTrusted: false,
        homeDir,
      }),
    ).toEqual({ disabled: true, source: "global" });
  });

  it("stores preferences under the skills config section", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });

    const config = JSON.parse(
      readFileSync(join(homeDir, ".pi", "agent", "supi", "config.json"), "utf-8"),
    );
    expect(config).toEqual({ skills: { modelInvocation: { review: true } } });
  });

  it("resolves project then global then source preferences", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });
    persistInvocation({ name: "review", disabled: false, scope: "project", cwd, homeDir });

    expect(
      resolveInvocation({
        name: "review",
        sourceDefault: true,
        scope: "project",
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toEqual({ disabled: false, source: "project" });
    expect(
      resolveInvocation({
        name: "review",
        sourceDefault: false,
        scope: "project",
        cwd,
        projectTrusted: false,
        homeDir,
      }),
    ).toEqual({ disabled: true, source: "global" });
  });

  it("removes a globally disabled skill from PI's generated prompt", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill();
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });
    const original = `System${formatSkillsForPrompt([loadedSkill])}`;

    const result = applyPromptOverrides({
      options: { cwd, skills: [loadedSkill] },
      systemPrompt: original,
      cwd,
      projectTrusted: true,
      homeDir,
    });

    expect(result).toBe("System");
  });

  it("does not add skills when the read tool is unavailable", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill(true);
    persistInvocation({ name: "review", disabled: false, scope: "global", cwd, homeDir });

    expect(
      applyPromptOverrides({
        options: { cwd, skills: [loadedSkill], selectedTools: ["bash"] },
        systemPrompt: "System",
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toBeUndefined();
  });

  it("adds an author-disabled skill when a trusted project enables it", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill(true);
    persistInvocation({ name: "review", disabled: false, scope: "project", cwd, homeDir });

    const result = applyPromptOverrides({
      options: { cwd, skills: [loadedSkill] },
      systemPrompt: "System",
      cwd,
      projectTrusted: true,
      homeDir,
    });

    expect(result).toContain("<name>review</name>");
    expect(
      applyPromptOverrides({
        options: { cwd, skills: [loadedSkill] },
        systemPrompt: "System",
        cwd,
        projectTrusted: false,
        homeDir,
      }),
    ).toBeUndefined();
  });
});
