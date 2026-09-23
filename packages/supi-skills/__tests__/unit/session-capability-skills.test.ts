import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type BuildSystemPromptOptions,
  formatSkillsForPrompt,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import {
  getSessionCapabilitySkillProvider,
  sessionCapabilityState,
} from "@mrclrchtr/supi-core/session";
import {
  createSettingsContributionCollector,
  type SettingsModule,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "@mrclrchtr/supi-core/settings";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import skillSettings from "../../src/skill-settings.ts";
import skillShortcut from "../../src/skill-shortcut.ts";

const tempDirs: string[] = [];
const sessionIds = ["skill-provider-session", "skill-prompt-session"];

function writeSkill(filePath: string, name: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `---\nname: ${name}\ndescription: Test ${name}\n---\n`, "utf-8");
}

function loadedSkill(filePath: string, scope: "user" | "project"): Skill {
  const name = filePath.split("/").at(-2) ?? "test-skill";
  return {
    name,
    description: `Loaded ${name} skill`,
    filePath,
    baseDir: dirname(filePath),
    sourceInfo: { path: filePath, source: "auto", scope, origin: "top-level" },
    disableModelInvocation: false,
  };
}

function createWorkspace() {
  const homeDir = mkdtempSync(join(tmpdir(), "supi-session-skills-"));
  tempDirs.push(homeDir);
  const agentDir = join(homeDir, ".pi", "agent");
  const cwd = join(homeDir, "project");
  const reviewPath = join(agentDir, "skills", "supi-test-review", "SKILL.md");
  const visiblePath = join(agentDir, "skills", "supi-test-visible", "SKILL.md");
  const projectPath = join(cwd, ".pi", "skills", "supi-test-project", "SKILL.md");
  writeSkill(reviewPath, "supi-test-review");
  writeSkill(join(agentDir, "skills", "supi-test-review-copy", "SKILL.md"), "supi-test-review");
  writeSkill(visiblePath, "supi-test-visible");
  writeSkill(projectPath, "supi-test-project");
  return {
    homeDir,
    agentDir,
    cwd,
    loadedSkills: [
      loadedSkill(reviewPath, "user"),
      loadedSkill(visiblePath, "user"),
      loadedSkill(projectPath, "project"),
    ],
  };
}

function commandContext(cwd: string, skills: Skill[]) {
  return {
    ...makeCtx({ cwd, isProjectTrusted: () => true }),
    getSystemPromptOptions: () => ({ cwd, skills }) satisfies BuildSystemPromptOptions,
    ui: { ...makeCtx().ui, addAutocompleteProvider: vi.fn() },
  };
}

function createSkillSettings() {
  const workspace = createWorkspace();
  const pi = createPiMock();
  skillSettings(pi as never, { agentDir: workspace.agentDir, homeDir: workspace.homeDir });
  const collector = createSettingsContributionCollector();
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, collector);
  const module = collector.result().modules.find((item) => item.id === "skills");
  if (!module) throw new Error("Skills settings module is missing");
  const ctx = commandContext(workspace.cwd, workspace.loadedSkills);
  const sessionCtx = {
    ...ctx,
    sessionManager: { getSessionId: () => sessionIds[0] },
  };
  return { ...workspace, pi, module, ctx, sessionCtx };
}

afterEach(() => {
  for (const sessionId of sessionIds) sessionCapabilityState.clear(sessionId);
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("session capability skills", () => {
  it("lists loaded winners after persistent model preferences and excludes --no-skills", async () => {
    const { pi, module, cwd, ctx, sessionCtx, loadedSkills } = createSkillSettings();
    const settingsModule = module as SettingsModule;
    await settingsModule.apply({
      scope: "global",
      cwd,
      fieldKey: "supi-test-review",
      action: { kind: "set", value: "Model invocation disabled" },
      ctx: ctx as never,
    });
    await pi.emit("session_start", { type: "session_start", reason: "startup" }, sessionCtx);
    const provider = getSessionCapabilitySkillProvider<typeof ctx>(sessionIds[0] as string);
    const eligible = await provider?.listEligibleSkills(ctx as never);
    const noSkillsContext = commandContext(cwd, []);

    expect(eligible?.map((skill) => skill.name)).toEqual([
      "supi-test-project",
      "supi-test-visible",
    ]);
    expect(await provider?.listEligibleSkills(noSkillsContext as never)).toEqual([]);
    expect(loadedSkills.map((skill) => skill.name)).toContain("supi-test-review");

    await pi.emit("session_shutdown", { reason: "switch" }, sessionCtx);
    expect(getSessionCapabilitySkillProvider(sessionIds[0] as string)).toBeUndefined();
  });

  it("keeps explicit skill commands and shortcuts when a skill is hidden from prompts", async () => {
    const { pi, cwd, loadedSkills, sessionCtx } = createSkillSettings();
    const sessionId = sessionIds[1] as string;
    (pi as unknown as { getCommands: () => unknown[] }).getCommands = vi.fn(() => [
      { name: "skill:supi-test-review", source: "skill" },
    ]);
    skillShortcut(pi as never);
    const promptContext = { ...sessionCtx, sessionManager: { getSessionId: () => sessionId } };
    await pi.emit("session_start", { type: "session_start", reason: "startup" }, promptContext);
    sessionCapabilityState.set(sessionId, {
      version: 1,
      eligibleToolNames: [],
      initiallyInactiveToolNames: [],
      toolDenylist: [],
      hiddenSkillNames: ["supi-test-review"],
    });

    const options = { cwd, skills: loadedSkills } satisfies BuildSystemPromptOptions;
    const beforeAgentStart = pi.getHandlers("before_agent_start")[0];
    if (!beforeAgentStart) throw new Error("Skill prompt filter is missing");
    await beforeAgentStart(
      {
        systemPrompt: `System${formatSkillsForPrompt(options.skills)}`,
        systemPromptOptions: options,
      },
      promptContext,
    );

    const input = pi.getHandlers("input")[0];
    if (!input) throw new Error("Skill shortcut handler is missing");
    expect(options.skills?.map((skill) => skill.name)).toEqual([
      "supi-test-visible",
      "supi-test-project",
    ]);
    expect(input({ text: "$supi-test-review" })).toEqual({
      action: "transform",
      text: "/skill:supi-test-review",
    });
    expect((pi as unknown as { getCommands: () => unknown[] }).getCommands()).toEqual([
      { name: "skill:supi-test-review", source: "skill" },
    ]);
  });
});
