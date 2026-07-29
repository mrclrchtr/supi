import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedChildResources } from "../../src/tool/child-resource-loader.ts";

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
});
