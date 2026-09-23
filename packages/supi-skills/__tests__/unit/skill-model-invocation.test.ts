import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSkillsForPrompt, type Skill } from "@earendil-works/pi-coding-agent";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function skill(disableModelInvocation = false, name = "review"): Skill {
  return {
    name,
    description: "Review code",
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    sourceInfo: {
      path: `/skills/${name}/SKILL.md`,
      source: "test",
      scope: "user",
      origin: "top-level",
    },
    disableModelInvocation,
  };
}

afterEach(() => {
  resetDebugRegistry();
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
    const options = { cwd, skills: [loadedSkill] };
    const result = applyPromptOverrides({
      options,
      systemPrompt: `System${formatSkillsForPrompt(options.skills)}`,
      cwd,
      projectTrusted: true,
      homeDir,
    });

    expect(result).toBeUndefined();
    expect(options.skills?.[0]?.disableModelInvocation).toBe(true);
    expect(formatSkillsForPrompt(options.skills)).toBe("");
  });

  it("updates the matching forced skills section", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const visibleSkill = skill();
    const newlyEnabledSkill = skill(true, "implement");
    persistInvocation({ name: "implement", disabled: false, scope: "project", cwd, homeDir });
    const skills = [visibleSkill, newlyEnabledSkill];
    const original = formatSkillsForPrompt(skills).trim();
    const foreignSkills = "<skills>\n<example>Keep this text</example>\n</skills>";
    const systemPrompt = `${foreignSkills}\n<skills>\n${original}\n</skills>`;
    const options = { cwd, skills, forceSystemPrompt: systemPrompt };

    expect(
      applyPromptOverrides({
        options,
        systemPrompt,
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toBeUndefined();
    expect(options.forceSystemPrompt).toContain(foreignSkills);
    expect(options.forceSystemPrompt).toContain("<name>implement</name>");
    expect(formatSkillsForPrompt(options.skills)).toContain("<name>implement</name>");
  });

  it("hides session-disabled skills from normal and forced prompts", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const visibleSkill = skill(false, "visible");
    const hiddenSkill = skill(false, "hidden");
    const skills = [visibleSkill, hiddenSkill];
    const originalSkills = formatSkillsForPrompt(skills).trim();
    const systemPrompt = `<skills>\n${originalSkills}\n</skills>`;
    const options = { cwd, skills, forceSystemPrompt: systemPrompt };

    expect(
      applyPromptOverrides({
        options,
        systemPrompt,
        cwd,
        projectTrusted: true,
        homeDir,
        hiddenSkillNames: new Set(["hidden"]),
      }),
    ).toBeUndefined();
    expect(options.forceSystemPrompt).toContain("<name>visible</name>");
    expect(options.forceSystemPrompt).not.toContain("<name>hidden</name>");
    expect(options.skills?.map((item) => item.name)).toEqual(["visible"]);
  });

  it("updates a forced prompt that contains PI's structured skills section", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill();
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });
    const skillsPrompt = formatSkillsForPrompt([loadedSkill]).trim();
    const systemPrompt = `<preamble>Custom policy</preamble>\n<skills>\n${skillsPrompt}\n</skills>`;
    const options = { cwd, skills: [loadedSkill], forceSystemPrompt: systemPrompt };

    expect(
      applyPromptOverrides({
        options,
        systemPrompt,
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toBeUndefined();
    expect(options.forceSystemPrompt).toContain("Custom policy");
    expect(options.forceSystemPrompt).not.toContain("<name>review</name>");
    expect(formatSkillsForPrompt(options.skills)).toBe("");
  });

  it("records forced-prompt mismatches in the debug registry", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill();
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });
    configureDebugRegistry({ enabled: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    applyPromptOverrides({
      options: { cwd, skills: [loadedSkill], forceSystemPrompt: "System" },
      systemPrompt: "System",
      cwd,
      projectTrusted: true,
      homeDir,
    });

    expect(getDebugEvents({ source: "supi-skills", category: "prompt-overrides" }).events).toEqual([
      expect.objectContaining({
        source: "supi-skills",
        level: "warning",
        category: "prompt-overrides",
        message: "Could not apply skill model-invocation overrides",
        data: expect.objectContaining({
          changedSkills: ["review"],
          forceSystemPrompt: true,
          hasSkillsSection: false,
        }),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[supi-skills] Could not apply skill model-invocation overrides",
    );
    warn.mockRestore();
  });

  it("uses bash when read is unavailable", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill();
    persistInvocation({ name: "review", disabled: true, scope: "global", cwd, homeDir });
    const options = { cwd, skills: [loadedSkill], selectedTools: ["bash"] };

    expect(
      applyPromptOverrides({
        options,
        systemPrompt: "System",
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toBeUndefined();
    expect(options.skills?.[0]?.disableModelInvocation).toBe(true);
    expect(formatSkillsForPrompt(options.skills, "bash")).toBe("");
  });

  it("does not apply overrides without a skill file tool", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill(true);
    persistInvocation({ name: "review", disabled: false, scope: "global", cwd, homeDir });
    const options = { cwd, skills: [loadedSkill], selectedTools: ["edit"] };

    expect(
      applyPromptOverrides({
        options,
        systemPrompt: "System",
        cwd,
        projectTrusted: true,
        homeDir,
      }),
    ).toBeUndefined();
    expect(options.skills?.[0]?.disableModelInvocation).toBe(true);
  });

  it("adds an author-disabled skill when a trusted project enables it", () => {
    const homeDir = tempHome();
    const cwd = join(homeDir, "project");
    const loadedSkill = skill(true);
    persistInvocation({ name: "review", disabled: false, scope: "project", cwd, homeDir });

    const options = { cwd, skills: [loadedSkill] };
    const result = applyPromptOverrides({
      options,
      systemPrompt: "System",
      cwd,
      projectTrusted: true,
      homeDir,
    });

    expect(result).toBeUndefined();
    expect(formatSkillsForPrompt(options.skills)).toContain("<name>review</name>");
    const untrustedOptions = { cwd, skills: [loadedSkill] };
    expect(
      applyPromptOverrides({
        options: untrustedOptions,
        systemPrompt: "System",
        cwd,
        projectTrusted: false,
        homeDir,
      }),
    ).toBeUndefined();
    expect(formatSkillsForPrompt(untrustedOptions.skills)).toBe("");
  });
});
