import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedChildResources } from "../../src/tool/review_run/child-resources.ts";

describe("createIsolatedResourceLoader", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("suppresses inherited context and discovered system prompts", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-review-project-"));
    const agentDir = mkdtempSync(join(tmpdir(), "supi-review-agent-"));
    roots.push(cwd, agentDir);
    writeFileSync(join(cwd, "CLAUDE.md"), "project context");
    mkdirSync(join(cwd, ".pi"));
    writeFileSync(join(cwd, ".pi", "SYSTEM.md"), "project replacement");
    writeFileSync(join(cwd, ".pi", "APPEND_SYSTEM.md"), "project appendix");
    writeFileSync(join(agentDir, "AGENTS.md"), "global context");
    writeFileSync(join(agentDir, "SYSTEM.md"), "unintended replacement");
    writeFileSync(join(agentDir, "APPEND_SYSTEM.md"), "unintended appendix");

    const { loader, settingsManager } = createIsolatedChildResources(
      cwd,
      "owned protocol",
      agentDir,
    );
    await loader.reload();

    expect(settingsManager.getCompactionEnabled()).toBe(false);
    expect(settingsManager.getRetrySettings().enabled).toBe(false);
    expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    expect(loader.getSystemPrompt()).toBe("owned protocol");
    expect(loader.getAppendSystemPrompt()).toEqual([]);
  });

  it("loads explicit codemode and headless inspection factories without ambient extensions", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-review-codemode-project-"));
    const agentDir = mkdtempSync(join(tmpdir(), "supi-review-codemode-agent-"));
    roots.push(cwd, agentDir);
    mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
    writeFileSync(
      join(cwd, ".pi", "extensions", "ambient.ts"),
      'export default (pi) => pi.registerTool({ name: "ambient_bypass" });',
    );

    const { loader, settingsManager } = createIsolatedChildResources(
      cwd,
      "owned protocol",
      agentDir,
      { headlessInspection: true, codemode: true },
    );
    await loader.reload();

    const extensions = loader.getExtensions().extensions;
    const registeredTools = extensions.flatMap((extension) =>
      [...extension.tools.values()].map(({ definition }) => definition),
    );
    const codemode = registeredTools.find((tool) => tool.name === "codemode");

    expect(extensions).toHaveLength(2);
    expect(
      extensions.some((extension) => extension.path.includes("supi-code-intelligence-headless")),
    ).toBe(true);
    expect(registeredTools.map((tool) => tool.name)).toContain("codemode");
    expect(registeredTools.map((tool) => tool.name)).not.toContain("ambient_bypass");
    expect(registeredTools.map((tool) => tool.name)).not.toContain("tool_search");
    expect(
      registeredTools.filter(
        (tool) =>
          tool.name !== "codemode" &&
          (tool.exposure === "codemode" || tool.exposure === "deferred"),
      ),
    ).toEqual([]);
    expect(codemode?.description).toContain("classifiers and image generation");
    expect(codemode?.exposure).toBe("model-only");
    expect(settingsManager.getCompactionEnabled()).toBe(false);
  });

  it("does not load codemode without the Reviewer opt-in", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "supi-review-no-codemode-project-"));
    const agentDir = mkdtempSync(join(tmpdir(), "supi-review-no-codemode-agent-"));
    roots.push(cwd, agentDir);

    const { loader } = createIsolatedChildResources(cwd, "owned protocol", agentDir, {
      headlessInspection: true,
    });
    await loader.reload();

    const registeredTools = loader
      .getExtensions()
      .extensions.flatMap((extension) => [...extension.tools.keys()]);
    expect(registeredTools).not.toContain("codemode");
    expect(registeredTools).not.toContain("tool_search");
  });
});
