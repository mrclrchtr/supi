import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BuildSystemPromptOptions, Skill } from "@earendil-works/pi-coding-agent";
import {
  createSettingsContributionCollector,
  type SettingsAction,
  type SettingsModule,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import skillSettings from "../../src/skill-settings.ts";

const tempDirs: string[] = [];

function createWorkspace() {
  const homeDir = mkdtempSync(join(tmpdir(), "supi-skill-settings-"));
  tempDirs.push(homeDir);
  const agentDir = join(homeDir, ".pi", "agent");
  const cwd = join(homeDir, "project");
  writeSkill(join(agentDir, "skills", "supi-test-review", "SKILL.md"), "supi-test-review");
  writeSkill(join(agentDir, "skills", "supi-test-review-copy", "SKILL.md"), "supi-test-review");
  writeSkill(join(cwd, ".pi", "skills", "supi-test-project", "SKILL.md"), "supi-test-project");
  return { homeDir, agentDir, cwd };
}

function writeSkill(path: string, name: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Test ${name}\n---\n`, "utf-8");
}

function loadedStaticSkill(agentDir: string): Skill {
  const filePath = join(agentDir, "skills", "supi-test-review", "SKILL.md");
  return {
    name: "supi-test-review",
    description: "Loaded review skill",
    filePath,
    baseDir: dirname(filePath),
    sourceInfo: {
      path: filePath,
      source: "auto",
      scope: "user",
      origin: "top-level",
    },
    disableModelInvocation: false,
  };
}

function commandContext(cwd: string, skills: Skill[] = []) {
  const notify = vi.fn();
  return {
    ...makeCtx({ cwd, isProjectTrusted: () => true }),
    getSystemPromptOptions: () => ({ cwd, skills }) satisfies BuildSystemPromptOptions,
    ui: { ...makeCtx().ui, notify },
  };
}

async function setup(projectTrusted = true, globalSettings?: Record<string, unknown>) {
  const workspace = createWorkspace();
  if (globalSettings) {
    writeFileSync(
      join(workspace.agentDir, "settings.json"),
      JSON.stringify(globalSettings),
      "utf-8",
    );
  }
  const pi = createPiMock();
  skillSettings(pi as never, {
    agentDir: workspace.agentDir,
    homeDir: workspace.homeDir,
  });
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  const module = collector.result().modules.find((item) => item.id === "skills");
  if (!module) throw new Error("Skills settings module was not registered");
  const ctx = commandContext(workspace.cwd);
  ctx.isProjectTrusted = () => projectTrusted;
  return { ...workspace, pi, module, ctx };
}

async function rows(
  module: SettingsModule,
  scope: "global" | "project",
  cwd: string,
  ctx = commandContext(cwd),
) {
  return (await module.read({ scope, cwd, ctx: ctx as never })).rows;
}

// biome-ignore lint/complexity/useMaxParams: test helper mirrors a scoped module row lookup
async function row(
  module: SettingsModule,
  scope: "global" | "project",
  cwd: string,
  name: string,
  ctx = commandContext(cwd),
) {
  const match = (await rows(module, scope, cwd, ctx)).find((item) => item.field.key === name);
  if (!match) throw new Error(`Missing skill row: ${name}`);
  return match;
}

// biome-ignore lint/complexity/useMaxParams: test helper mirrors SettingsActionRequest fields
function apply(
  module: SettingsModule,
  scope: "global" | "project",
  cwd: string,
  fieldKey: string,
  action: SettingsAction,
  ctx = commandContext(cwd),
) {
  return module.apply({ scope, cwd, fieldKey, action, ctx: ctx as never });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("skill settings", () => {
  it("shows user skills globally and adds project skills in project scope", async () => {
    const { module, cwd, ctx } = await setup();
    const globalKeys = (await rows(module, "global", cwd, ctx)).map((item) => item.field.key);
    const projectKeys = (await rows(module, "project", cwd, ctx)).map((item) => item.field.key);

    expect(globalKeys).toContain("supi-test-review");
    expect(globalKeys).not.toContain("supi-test-project");
    expect(projectKeys).toEqual(expect.arrayContaining(["supi-test-review", "supi-test-project"]));
  });

  it("stores model invocation state without requiring reload", async () => {
    const { module, cwd, ctx } = await setup();

    await apply(
      module,
      "global",
      cwd,
      "supi-test-review",
      { kind: "set", value: "Model invocation disabled" },
      ctx,
    );

    expect((await row(module, "global", cwd, "supi-test-review", ctx)).editValue).toBe(
      "Model invocation disabled",
    );

    await apply(module, "global", cwd, "supi-test-review", { kind: "unset" }, ctx);
    expect((await row(module, "global", cwd, "supi-test-review", ctx)).editValue).toBe("Enabled");
  });

  it("fully disables a static skill and requests reload", async () => {
    const { module, cwd, agentDir } = await setup();
    const ctx = commandContext(cwd, [loadedStaticSkill(agentDir)]);

    const result = await apply(
      module,
      "global",
      cwd,
      "supi-test-review",
      { kind: "set", value: "Disabled" },
      ctx,
    );

    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as {
      skills: string[];
    };
    expect(settings.skills).toEqual(
      expect.arrayContaining([
        "-skills/supi-test-review/SKILL.md",
        "-skills/supi-test-review-copy/SKILL.md",
      ]),
    );
    const disabledRow = (await rows(module, "global", cwd, ctx)).find(
      (item) => item.field.key === "supi-test-review",
    );
    expect(disabledRow?.editValue).toBe("Disabled");
    expect((await row(module, "project", cwd, "supi-test-review", ctx)).displayValue).toBe(
      "Disabled (global)",
    );
    expect(result).toEqual({
      notice: { message: "Reload required for skill load changes", level: "info" },
    });
  });

  it("shows a project-disabled inherited skill as pending reload", async () => {
    const { module, cwd, agentDir } = await setup();
    const ctx = commandContext(cwd, [loadedStaticSkill(agentDir)]);

    await apply(
      module,
      "project",
      cwd,
      "supi-test-review",
      { kind: "set", value: "Disabled" },
      ctx,
    );

    const disabledRow = (await rows(module, "project", cwd, ctx)).find(
      (item) => item.field.key === "supi-test-review",
    );
    expect(disabledRow?.editValue).toBe("Disabled");
  });

  it("removes project support paths when an inherited load override is unset", async () => {
    const { module, cwd, agentDir } = await setup();
    const ctx = commandContext(cwd, [loadedStaticSkill(agentDir)]);

    await apply(
      module,
      "project",
      cwd,
      "supi-test-review",
      { kind: "set", value: "Disabled" },
      ctx,
    );
    await apply(module, "project", cwd, "supi-test-review", { kind: "unset" }, ctx);

    const settings = JSON.parse(readFileSync(join(cwd, ".pi", "settings.json"), "utf-8")) as {
      skills?: string[];
    };
    expect(settings.skills).toEqual([]);
  });

  it("treats an active skill at a filtered static path as runtime-contributed", async () => {
    const { module, cwd, agentDir } = await setup(true, {
      skills: ["-skills/supi-test-review/SKILL.md", "-skills/supi-test-review-copy/SKILL.md"],
    });
    const filePath = join(agentDir, "skills", "supi-test-review", "SKILL.md");
    const runtimeSkill: Skill = {
      name: "supi-test-review",
      description: "Runtime review",
      filePath,
      baseDir: dirname(filePath),
      sourceInfo: {
        path: filePath,
        source: "runtime-extension",
        scope: "user",
        origin: "package",
      },
      disableModelInvocation: false,
    };
    const ctx = commandContext(cwd, [runtimeSkill]);
    const runtime = (await rows(module, "global", cwd, ctx)).find(
      (item) => item.field.key === runtimeSkill.name,
    );

    if (runtime?.field.kind !== "enum") throw new Error("Runtime row is not an enum");
    expect(runtime.editValue).toBe("Enabled");
    expect(runtime.field.values).toEqual(["Enabled", "Model invocation disabled"]);

    await apply(
      module,
      "global",
      cwd,
      runtimeSkill.name,
      { kind: "set", value: "Model invocation disabled" },
      ctx,
    );
    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as {
      skills: string[];
    };
    expect(settings.skills).toEqual([
      "-skills/supi-test-review/SKILL.md",
      "-skills/supi-test-review-copy/SKILL.md",
    ]);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("keeps observable runtime provenance at an enabled static path", async () => {
    const { module, cwd, agentDir } = await setup();
    const filePath = join(agentDir, "skills", "supi-test-review", "SKILL.md");
    const runtimeSkill: Skill = {
      name: "supi-test-review",
      description: "Runtime review",
      filePath,
      baseDir: dirname(filePath),
      sourceInfo: {
        path: filePath,
        source: "runtime-extension",
        scope: "temporary",
        origin: "top-level",
      },
      disableModelInvocation: false,
    };
    const runtime = (await rows(module, "global", cwd, commandContext(cwd, [runtimeSkill]))).find(
      (item) => item.field.key === runtimeSkill.name,
    );

    if (runtime?.field.kind !== "enum") throw new Error("Runtime row is not an enum");
    expect(runtime.field.values).toEqual(["Enabled", "Model invocation disabled"]);
  });

  it("limits runtime-contributed skills to model invocation choices", async () => {
    const { module, cwd } = await setup();
    const runtimeSkill: Skill = {
      name: "supi-test-runtime",
      description: "Runtime skill",
      filePath: "/runtime/SKILL.md",
      baseDir: "/runtime",
      sourceInfo: {
        path: "/runtime/SKILL.md",
        source: "runtime-extension",
        scope: "user",
        origin: "package",
      },
      disableModelInvocation: false,
    };
    const values = await rows(module, "global", cwd, commandContext(cwd, [runtimeSkill]));
    const runtime = values.find((item) => item.field.key === runtimeSkill.name);

    expect(runtime?.field.kind).toBe("enum");
    if (runtime?.field.kind !== "enum") throw new Error("Runtime row is not an enum");
    expect(runtime.field.values).toEqual(["Enabled", "Model invocation disabled"]);
  });

  it("rejects project writes for an untrusted project", async () => {
    const { module, cwd, ctx } = await setup(false);

    await expect(
      apply(
        module,
        "project",
        cwd,
        "supi-test-review",
        { kind: "set", value: "Model invocation disabled" },
        ctx,
      ),
    ).rejects.toThrow("Project is not trusted");
  });
});
