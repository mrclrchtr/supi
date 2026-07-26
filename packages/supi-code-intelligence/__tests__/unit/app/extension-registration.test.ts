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

  it("retains selection-critical guidance in registered descriptions", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const resolveDescription = getTool(pi, "code_resolve").description ?? "";
    expect(resolveDescription).toContain("concrete ready LSP client");
    expect(resolveDescription).toContain("never falls back to text search");

    const findDescription = getTool(pi, "code_find").description ?? "";
    expect(findDescription).toContain('mode:"ast"');
    expect(findDescription).toContain("LSP workspace symbols");
    expect(findDescription).toContain("PI grep for literal/regex source search");
    expect(findDescription).toContain("Modes never silently fall back");
    expect(findDescription).toContain("Incomplete scans disclose limitations");

    expect(getTool(pi, "code_graph").description).toContain("not symbol identity");
    expect(getTool(pi, "code_health").description).toContain("Report live diagnostics");
    expect(getTool(pi, "code_refactor_plan").description).toContain("without mutating files");
    expect(getTool(pi, "code_refactor_apply").description).toContain("before mutation");

    for (const name of CODE_INTELLIGENCE_TOOL_NAMES) {
      const description = getTool(pi, name).description ?? "";
      expect(description).toContain(
        "Output over 2000 lines or 50KB is truncated, with full Markdown saved to a temporary file",
      );
    }
  });

  it("uses an exact-one nested refactor operation and a plan-only apply input", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const planner = propertiesOf(getTool(pi, "code_refactor_plan"));
    expect(planner).toHaveProperty("operation");
    expect(JSON.stringify(planner.operation)).toContain("rename_symbol");
    expect(JSON.stringify(planner.operation)).not.toContain('"rename"');

    expect(Object.keys(propertiesOf(getTool(pi, "code_refactor_apply")))).toEqual(["planId"]);
  });

  it("shares one process-exit listener across extension reloads", () => {
    const first = createPiMock();
    codeIntelligenceExtension(first as never);
    const afterFirst = process.listenerCount("exit");

    const second = createPiMock();
    codeIntelligenceExtension(second as never);
    expect(process.listenerCount("exit")).toBe(afterFirst);

    const shutdown = second.getHandlers("session_shutdown").at(-1);
    expect(shutdown).toBeDefined();
    shutdown?.({} as never, {} as never);
    expect(process.listenerCount("exit")).toBeLessThanOrEqual(afterFirst);
  });
});
