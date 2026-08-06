import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentProfile } from "../../src/api.ts";
import {
  createAgentSessionInputs,
  packagePromptPath,
  selectInstructionFiles,
} from "../../src/api.ts";

const temporaryDirectories: string[] = [];
const providerAuthority = {
  getProvider: () => undefined,
  getProviderAuth: async () => undefined,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup(): Promise<{
  root: string;
  agentDir: string;
  project: string;
  profile: AgentProfile;
}> {
  const root = await mkdtemp(join(tmpdir(), "supi-agent-resources-"));
  temporaryDirectories.push(root);
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  await mkdir(agentDir, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(agentDir, "AGENTS.md"), "global instructions", "utf8");
  await writeFile(join(project, "CLAUDE.md"), "project instructions", "utf8");
  await writeFile(join(agentDir, "SYSTEM.md"), "ambient system prompt", "utf8");
  const profile: AgentProfile = {
    id: "custom",
    source: "global",
    directory: join(agentDir, "supi", "agents", "custom"),
    manifest: {
      description: "custom",
      tools: ["read"],
      systemPrompt: "custom",
      instructionScopes: ["global", "project"],
    },
    customSystemPrompt: "complete custom prompt",
  };
  return { root, agentDir, project, profile };
}

describe("profile resource policy", () => {
  it("resolves package prompt assets by their package prompt ID", () => {
    expect(
      packagePromptPath("supi:explore").endsWith(join("profiles", "explore", "SYSTEM.md")),
    ).toBe(true);
  });

  it("loads only selected instruction scopes and excludes PI system files", async () => {
    const setupState = await setup();
    const files = selectInstructionFiles(
      setupState.profile,
      setupState.project,
      setupState.agentDir,
    );
    expect(files.map((file) => file.content)).toEqual([
      "global instructions",
      "project instructions",
    ]);

    const inputs = createAgentSessionInputs({
      cwd: setupState.project,
      agentDir: setupState.agentDir,
      projectTrusted: true,
      providerAuthority,
      model: { provider: "openai", id: "gpt-5", reasoning: false } as never,
      thinkingLevel: "off",
      profile: setupState.profile,
    });

    await inputs.resourceLoader.reload();
    expect(inputs.resourceLoader.getSystemPrompt()).toBe("complete custom prompt");
    expect(inputs.resourceLoader.getAppendSystemPrompt()).toEqual([]);
    expect(inputs.resourceLoader.getAgentsFiles().agentsFiles.map((file) => file.content)).toEqual(
      files.map((file) => file.content),
    );
    expect(inputs.resourceLoader.getSkills().skills).toEqual([]);
    expect(inputs.resourceLoader.getPrompts().prompts).toEqual([]);
    expect(inputs.resourceLoader.getThemes().themes).toEqual([]);

    const nativeInputs = createAgentSessionInputs({
      cwd: setupState.project,
      agentDir: setupState.agentDir,
      projectTrusted: true,
      providerAuthority,
      model: inputs.model,
      thinkingLevel: inputs.thinkingLevel,
      profile: {
        ...setupState.profile,
        manifest: { ...setupState.profile.manifest, systemPrompt: "native" },
      },
    });
    await nativeInputs.resourceLoader.reload();
    expect(nativeInputs.resourceLoader.getSystemPrompt()).toBeUndefined();
    expect(nativeInputs.resourceLoader.getSystemPromptSource()).toBeUndefined();
  });

  it("keeps the package-owned Code Intelligence profile headless", async () => {
    const profile: AgentProfile = {
      id: "inspect",
      source: "package",
      directory: "/profiles/inspect",
      manifest: {
        description: "inspect",
        tools: ["code_resolve"],
        systemPrompt: "native",
        instructionScopes: [],
      },
    };
    const inputs = createAgentSessionInputs({
      cwd: "/project",
      agentDir: "/agent",
      projectTrusted: false,
      providerAuthority,
      model: { provider: "openai", id: "gpt-5", reasoning: false } as never,
      thinkingLevel: "off",
      profile,
    });

    await inputs.resourceLoader.reload();
    const extensions = inputs.resourceLoader.getExtensions().extensions;
    expect(extensions).toHaveLength(1);
    expect([...extensions[0].tools.keys()].sort()).toEqual([
      "code_find",
      "code_graph",
      "code_health",
      "code_inspect",
      "code_orientation",
      "code_resolve",
    ]);
    expect(inputs.tools).toEqual(["code_resolve"]);
  });
});
