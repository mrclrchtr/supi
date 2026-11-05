import { requestChildWebTools } from "@mrclrchtr/supi-core/session";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { createChildWebToolsFactory, registerChildWebToolProvider } from "../../src/child.ts";

function toolNames(pi: ReturnType<typeof createPiMock>): string[] {
  return pi.tools.map((tool) => (tool as { name: string }).name);
}

describe("child Web tool provision", () => {
  it("registers only the selected tools without settings, checks, or warnings", () => {
    const child = createPiMock();
    createChildWebToolsFactory(["web_search", "web_docs_fetch"], "/parent")(child as never);

    expect(toolNames(child)).toEqual(["web_search", "web_docs_fetch"]);
    expect(child.handlers.size).toBe(0);
  });

  it("offers the tools currently callable in the parent session", () => {
    const parent = createPiMock();
    parent.tools.push(
      { name: "web_fetch_md", exposure: "direct" },
      { name: "web_docs_search", exposure: "direct" },
    );
    parent.setActiveTools(["web_fetch_md"]);
    registerChildWebToolProvider(parent as never);

    expect(requestChildWebTools(parent.events, { configCwd: "/parent" })?.toolNames).toEqual([
      "web_fetch_md",
    ]);
  });
});
