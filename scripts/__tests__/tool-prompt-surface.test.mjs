import { describe, expect, it } from "vitest";

const PACKAGES = new URL("../../packages", import.meta.url).pathname;

async function collectPromptSurfaces() {
  const surfaces = [];
  const add = (name, surface) =>
    surfaces.push({
      name,
      description: surface.description ?? surface.toolDescription,
      promptSnippet: surface.promptSnippet,
      promptGuidelines: surface.promptGuidelines,
    });

  let module;
  module = await import(`${PACKAGES}/supi-ask-user/src/tool/ask_user/guidance.ts`);
  add("ask_user", module.ASK_USER_PROMPT_SURFACE_DEFAULTS);
  module = await import(`${PACKAGES}/supi-cache/src/tool/cache_forensics/guidance.ts`);
  add("cache_forensics", module);
  module = await import(`${PACKAGES}/supi-context/src/tool/context_report/guidance.ts`);
  add("context_report", module);
  module = await import(`${PACKAGES}/supi-debug/src/tool/debug/guidance.ts`);
  add("debug", module);
  module = await import(`${PACKAGES}/supi-agent/src/tool/agent_run/guidance.ts`);
  add("agent_run", module);
  module = await import(`${PACKAGES}/supi-antigravity/src/tool/antigravity_run/guidance.ts`);
  add("antigravity_run", module);

  module = await import(`${PACKAGES}/supi-code-intelligence/src/tool/guidance.ts`);
  for (const [name, surface] of Object.entries(module.CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES)) {
    add(name, surface);
  }

  for (const name of ["review_run", "review_output", "review_audit"]) {
    module = await import(`${PACKAGES}/supi-review/src/tool/${name}/guidance.ts`);
    add(name, module);
  }
  for (const name of ["web_fetch_md", "web_docs_search", "web_docs_fetch", "web_search"]) {
    module = await import(`${PACKAGES}/supi-web/src/tool/${name}/guidance.ts`);
    add(name, module);
  }

  return surfaces;
}

describe("SuPi tool prompt surfaces", () => {
  it("keeps prompt snippets as short capability phrases without the tool name", {
    timeout: 10_000,
  }, async () => {
    const surfaces = await collectPromptSurfaces();

    for (const { name, promptSnippet } of surfaces) {
      if (promptSnippet === undefined) continue;
      expect(typeof promptSnippet, `${name} promptSnippet`).toBe("string");
      expect(promptSnippet.length, `${name} promptSnippet`).toBeLessThanOrEqual(80);
      expect(promptSnippet, `${name} promptSnippet`).not.toContain("\n");
      expect(promptSnippet.toLocaleLowerCase(), `${name} promptSnippet`).not.toContain(
        name.toLocaleLowerCase(),
      );
    }
  });

  it("omits standard output-limit notices from tool descriptions", {
    timeout: 10_000,
  }, async () => {
    const surfaces = await collectPromptSurfaces();

    for (const { name, description } of surfaces) {
      expect(description, `${name} description`).not.toMatch(
        /2,000 lines|50(?:\.0)?\s*KB|51,200 bytes|standard tool-output limit/iu,
      );
    }
  });

  it("names the owning tool in every prompt guideline", { timeout: 10_000 }, async () => {
    const surfaces = await collectPromptSurfaces();

    for (const { name, promptGuidelines = [] } of surfaces) {
      for (const guideline of promptGuidelines) {
        expect(guideline, `${name} guideline`).toContain(name);
      }
    }
  });
});
