import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../../src/extension.ts";
import { CODE_INTELLIGENCE_TOOL_NAMES } from "../../../src/types/index.ts";

function propertiesOf(tool: unknown): Record<string, unknown> {
  return (
    (
      tool as {
        parameters?: { properties?: Record<string, unknown> };
      }
    ).parameters?.properties ?? {}
  );
}

describe("focused code intelligence tool registration", () => {
  it("registers exactly the eight public code_* tools", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const codeTools = getTools(pi)
      .map((tool) => tool.name)
      .filter((name) => name.startsWith("code_"));

    expect(codeTools.sort((left, right) => left.localeCompare(right))).toEqual(
      [...CODE_INTELLIGENCE_TOOL_NAMES].sort((left, right) => left.localeCompare(right)),
    );
    expect(codeTools).not.toContain("code_impact");
    expect(codeTools).not.toContain("code_relations");
  });

  it("registers every tool as executable", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    for (const name of CODE_INTELLIGENCE_TOOL_NAMES) {
      const tool = getTool(pi, name);
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe("function");
      expect(tool.description?.length).toBeGreaterThan(0);
    }
  });

  it("uses nested target selectors instead of legacy flat target fields", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    for (const name of ["code_resolve", "code_graph", "code_refactor_plan"] as const) {
      const properties = propertiesOf(getTool(pi, name));
      expect(properties).toHaveProperty("target");
      expect(properties).not.toHaveProperty("targetId");
      expect(properties).not.toHaveProperty("file");
      expect(properties).not.toHaveProperty("symbol");
      expect(properties).not.toHaveProperty("query");
    }
  });

  it("keeps point inspection and Orientation focus structurally nested", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect(propertiesOf(getTool(pi, "code_inspect"))).toHaveProperty("point");
    const orientation = propertiesOf(getTool(pi, "code_orientation"));
    expect(orientation).toHaveProperty("focus");
    expect(orientation).not.toHaveProperty("file");
    expect(orientation).not.toHaveProperty("line");
  });

  it("does not translate removed inputs through argument preparation", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    expect(getTool(pi, "code_find")).not.toHaveProperty("prepareArguments");
    expect(getTool(pi, "code_health")).not.toHaveProperty("prepareArguments");
  });

  it("keeps selection-critical distinctions in registered descriptions", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const selectionContracts = [
      {
        name: "code_resolve",
        patterns: [/real symbol anchor/i, /target handles/i, /does not fall back to text search/i],
      },
      {
        name: "code_inspect",
        patterns: [/source location/i, /point-local facts/i, /not broad code context/i],
      },
      {
        name: "code_orientation",
        patterns: [/omit `focus` for workspace context/i, /instruction files/i],
      },
      {
        name: "code_find",
        patterns: [/structural or semantic matches/i, /never silently falls back.*text search/i],
      },
      { name: "code_graph", patterns: [/source shape/i, /symbol identity/i] },
      {
        name: "code_refactor_plan",
        patterns: [/semantic refactor without changing files/i, /fall back to text edits/i],
      },
      {
        name: "code_refactor_apply",
        patterns: [/fresh stored refactor plan/i, /change its files/i, /regenerate a plan/i],
      },
      {
        name: "code_health",
        patterns: [
          /live diagnostics and language-server health/i,
          /diagnostic snapshots.*whole workspace/i,
          /server inventory and route-status counts.*workspace-wide/i,
        ],
      },
    ] as const;

    for (const { name, patterns } of selectionContracts) {
      const description = getTool(pi, name).description ?? "";
      for (const pattern of patterns) {
        expect(description, `${name} description`).toMatch(pattern);
      }
    }
  });

  it("keeps a short snippet for every always-active tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    for (const name of CODE_INTELLIGENCE_TOOL_NAMES) {
      const snippet = getTool(pi, name).promptSnippet;
      expect(typeof snippet, `${name} promptSnippet`).toBe("string");
      if (typeof snippet !== "string") continue;

      expect(snippet.trim(), `${name} promptSnippet`).not.toBe("");
      expect(snippet.length, `${name} promptSnippet`).toBeLessThanOrEqual(80);
    }
  });

  it("names the owning tool in every guideline bullet", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const resolveGuidelines = (getTool(pi, "code_resolve").promptGuidelines ?? []).join("\n");
    expect(resolveGuidelines).toMatch(/later tool requires a target handle/i);

    for (const name of CODE_INTELLIGENCE_TOOL_NAMES) {
      const guidelines: string[] = getTool(pi, name).promptGuidelines ?? [];
      for (const bullet of guidelines) {
        expect(bullet, `${name} guideline`).toContain(name);
      }
    }
  });

  it("uses an exact-one nested refactor operation and a plan-only apply input", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const planner = propertiesOf(getTool(pi, "code_refactor_plan"));
    expect(planner).toHaveProperty("operation");
    const operations = JSON.stringify(planner.operation);
    expect(operations).toContain("rename_symbol");
    expect(operations).toContain("update_imports");
    expect(operations).toContain("delete_dead_code");
    expect(operations).not.toContain('"rename"');
    expect(operations).not.toContain("rename_file");
    expect(operations).not.toContain("move_file");

    expect(Object.keys(propertiesOf(getTool(pi, "code_refactor_apply")))).toEqual(["planId"]);
  });
});
