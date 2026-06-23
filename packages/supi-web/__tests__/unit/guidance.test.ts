import { describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("node:child_process", () => ({
  spawnSync,
}));

import { getWebToolPromptSurface } from "../../src/tool/guidance.ts";
import { WEB_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

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
});
