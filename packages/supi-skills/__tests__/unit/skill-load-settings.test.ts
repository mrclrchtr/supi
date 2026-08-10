import { homedir } from "node:os";
import { join } from "node:path";
import {
  type PackageSource,
  type ResolvedResource,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  hasExactSkillLoadOverride,
  updateSkillLoadOverrides,
} from "../../src/skill-load-settings.ts";

const cwd = "/repo";
const agentDir = "/agent";

function topLevelResource(scope: "user" | "project" = "user"): ResolvedResource {
  const baseDir = scope === "project" ? "/repo/.pi" : agentDir;
  return {
    path: `${baseDir}/skills/review/SKILL.md`,
    enabled: true,
    metadata: { source: "auto", scope, origin: "top-level", baseDir },
  };
}

function packageResource(): ResolvedResource {
  return {
    path: "/packages/review/skills/review/SKILL.md",
    enabled: true,
    metadata: {
      source: "npm:review-skills",
      scope: "user",
      origin: "package",
      baseDir: "/packages/review",
    },
  };
}

function update(
  manager: SettingsManager,
  resources: ResolvedResource[],
  scope: "global" | "project",
  state: "load" | "unload" | "inherit",
): void {
  updateSkillLoadOverrides({
    settingsManager: manager,
    resources,
    scope,
    state,
    cwd,
    agentDir,
  });
}

describe("skill load settings", () => {
  it("adds and removes exact top-level filters without changing broad filters", () => {
    const manager = SettingsManager.inMemory({ skills: ["!skills/legacy/**"] });
    const resource = topLevelResource();

    update(manager, [resource], "global", "unload");

    expect(manager.getGlobalSettings().skills).toEqual([
      "!skills/legacy/**",
      "-skills/review/SKILL.md",
    ]);
    expect(
      hasExactSkillLoadOverride({
        settingsManager: manager,
        resources: [resource],
        scope: "global",
        cwd,
        agentDir,
      }),
    ).toBe(true);

    update(manager, [resource], "global", "inherit");
    expect(manager.getGlobalSettings().skills).toEqual(["!skills/legacy/**"]);
  });

  it("replaces an equivalent directory force-exclude", () => {
    const manager = SettingsManager.inMemory({ skills: ["-skills/review"] });
    const resource = topLevelResource();

    update(manager, [resource], "global", "load");

    expect(manager.getGlobalSettings().skills).toEqual(["+skills/review/SKILL.md"]);
  });

  it("uses a project exact path for an inherited user skill", () => {
    const manager = SettingsManager.inMemory({}, { projectTrusted: true });
    const resource = topLevelResource();

    update(manager, [resource], "project", "unload");

    expect(manager.getProjectSettings().skills).toEqual([resource.path, `-${resource.path}`]);

    update(manager, [resource], "project", "inherit");
    expect(manager.getProjectSettings().skills).toEqual([]);
  });

  it("updates package filters without removing other package configuration", () => {
    const packages: PackageSource[] = [
      {
        source: "npm:review-skills",
        extensions: ["extensions/index.ts"],
        skills: ["!skills/legacy/**"],
      },
    ];
    const manager = SettingsManager.inMemory({ packages });
    const resource = packageResource();

    update(manager, [resource], "global", "unload");

    expect(manager.getGlobalSettings().packages).toEqual([
      {
        source: "npm:review-skills",
        extensions: ["extensions/index.ts"],
        skills: ["!skills/legacy/**", "-skills/review/SKILL.md"],
      },
    ]);
  });

  it("replaces a package directory force-exclude", () => {
    const manager = SettingsManager.inMemory({
      packages: [{ source: "npm:review-skills", skills: ["-skills/review"] }],
    });
    const resource = packageResource();

    update(manager, [resource], "global", "load");

    expect(manager.getGlobalSettings().packages).toEqual([
      { source: "npm:review-skills", skills: ["+skills/review/SKILL.md"] },
    ]);
  });

  it("keeps an explicit package deny-all when one skill is enabled", () => {
    const manager = SettingsManager.inMemory({
      packages: [{ source: "npm:review-skills", skills: [] }],
    });
    const resource = packageResource();

    update(manager, [resource], "global", "load");
    expect(manager.getGlobalSettings().packages).toEqual([
      {
        source: "npm:review-skills",
        skills: ["!**", "+skills/review/SKILL.md"],
      },
    ]);

    update(manager, [resource], "global", "inherit");
    expect(manager.getGlobalSettings().packages).toEqual([
      { source: "npm:review-skills", skills: ["!**"] },
    ]);
  });

  it("does not turn an empty autoload-disabled delta into deny-all", () => {
    const manager = SettingsManager.inMemory({}, { projectTrusted: true });
    manager.setProjectPackages([{ source: "npm:review-skills", autoload: false, skills: [] }]);
    const resource = packageResource();

    update(manager, [resource], "project", "unload");

    expect(manager.getProjectSettings().packages).toEqual([
      {
        source: "npm:review-skills",
        autoload: false,
        skills: ["-skills/review/SKILL.md"],
      },
    ]);
  });

  it("creates and removes a project package delta", () => {
    const manager = SettingsManager.inMemory(
      { packages: ["npm:review-skills"] },
      { projectTrusted: true },
    );
    const resource = packageResource();

    update(manager, [resource], "project", "unload");

    expect(manager.getProjectSettings().packages).toEqual([
      {
        source: "npm:review-skills",
        autoload: false,
        skills: ["-skills/review/SKILL.md"],
      },
    ]);

    update(manager, [resource], "project", "inherit");
    expect(manager.getProjectSettings().packages).toEqual([]);
  });

  it("resolves a Windows tilde package source across scopes", () => {
    const manager = SettingsManager.inMemory(
      { packages: ["~\\skill-pack"] },
      { projectTrusted: true },
    );
    const packageDir = join(homedir(), "skill-pack");
    const resource = {
      ...packageResource(),
      path: join(packageDir, "skills", "review", "SKILL.md"),
      metadata: {
        ...packageResource().metadata,
        source: "~\\skill-pack",
        baseDir: packageDir,
      },
    };

    update(manager, [resource], "project", "unload");
    expect(manager.getProjectSettings().packages?.[0]).toMatchObject({ autoload: false });

    update(manager, [resource], "project", "inherit");
    expect(manager.getProjectSettings().packages).toEqual([]);
  });

  it("does not confuse equal relative package strings from different scopes", () => {
    const manager = SettingsManager.inMemory(
      { packages: ["skill-pack"] },
      { projectTrusted: true },
    );
    manager.setProjectPackages(["skill-pack"]);
    const resource = {
      ...packageResource(),
      path: "/agent/skill-pack/skills/review/SKILL.md",
      metadata: {
        ...packageResource().metadata,
        source: "skill-pack",
        baseDir: "/agent/skill-pack",
      },
    };

    update(manager, [resource], "project", "unload");

    expect(manager.getProjectSettings().packages).toHaveLength(2);
    expect(manager.getProjectSettings().packages?.[0]).toBe("skill-pack");
    expect(manager.getProjectSettings().packages?.[1]).toMatchObject({
      autoload: false,
      skills: ["-skills/review/SKILL.md"],
    });
  });

  it("resolves a bare local package source across scopes", () => {
    const manager = SettingsManager.inMemory(
      { packages: ["skill-pack"] },
      { projectTrusted: true },
    );
    const resource = {
      ...packageResource(),
      path: "/agent/skill-pack/skills/review/SKILL.md",
      metadata: {
        ...packageResource().metadata,
        source: "skill-pack",
        baseDir: "/agent/skill-pack",
      },
    };

    update(manager, [resource], "project", "unload");
    const projectPackage = manager.getProjectSettings().packages?.[0];
    expect(projectPackage).toMatchObject({ autoload: false });
    expect(typeof projectPackage === "string" ? projectPackage : projectPackage?.source).not.toBe(
      "skill-pack",
    );

    update(manager, [resource], "project", "inherit");
    expect(manager.getProjectSettings().packages).toEqual([]);
  });
});
