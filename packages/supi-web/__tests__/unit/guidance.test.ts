import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("node:child_process", () => ({
  spawnSync,
}));

import { FETCH_TIMEOUT_MAX_MS } from "../../src/fetch.ts";
import { getWebToolPromptSurface } from "../../src/tool/guidance.ts";
import { WEB_FETCH_MD_TOOL_NAME, WEB_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

const MODEL_SURFACE_CHAR_BUDGET = 950;

describe("web tool guidance", () => {
  const surfaces = WEB_TOOL_SPECS.map((spec) => ({
    spec,
    surface: getWebToolPromptSurface(spec.name),
  }));

  it("keeps model-facing prompt metadata compact", () => {
    const totalChars = surfaces.reduce(
      (total, { surface }) =>
        total +
        surface.description.length +
        surface.promptSnippet.length +
        surface.promptGuidelines.join("").length,
      0,
    );

    expect(totalChars).toBeLessThanOrEqual(MODEL_SURFACE_CHAR_BUDGET);
  });

  it("keeps prompt guidelines self-identifying", () => {
    for (const { spec, surface } of surfaces) {
      for (const guideline of surface.promptGuidelines) {
        expect(guideline).toContain(spec.name);
      }
    }
  });

  it("accepts only supported fetch timeout values", () => {
    const fetchSpec = WEB_TOOL_SPECS.find((spec) => spec.name === WEB_FETCH_MD_TOOL_NAME);
    if (!fetchSpec) throw new Error("The web fetch tool specification is missing.");

    const input = (timeout_ms: number) => ({ url: "https://example.com", timeout_ms });
    expect(Value.Check(fetchSpec.parameters, input(0))).toBe(true);
    expect(Value.Check(fetchSpec.parameters, input(FETCH_TIMEOUT_MAX_MS))).toBe(true);
    expect(Value.Check(fetchSpec.parameters, input(-1))).toBe(false);
    expect(Value.Check(fetchSpec.parameters, input(1.5))).toBe(false);
    expect(Value.Check(fetchSpec.parameters, input(FETCH_TIMEOUT_MAX_MS + 1))).toBe(false);
  });
});
