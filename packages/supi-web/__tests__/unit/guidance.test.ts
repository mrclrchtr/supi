import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";

import { FETCH_TIMEOUT_MAX_MS } from "../../src/fetch.ts";
import {
  getWebToolPromptSurface,
  WEB_FETCH_MD_TOOL_NAME,
  WEB_TOOL_SPECS,
} from "../../src/tool/tool-specs.ts";

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

  it("keeps prompt guidelines self-identifying and free of repeated call mechanics", () => {
    for (const { spec, surface } of surfaces) {
      for (const guideline of surface.promptGuidelines) {
        expect(guideline).toContain(spec.name);
      }
    }

    const fetch = surfaces.find(({ spec }) => spec.name === WEB_FETCH_MD_TOOL_NAME);
    expect(fetch?.surface.promptGuidelines).toEqual([]);
    expect(fetch?.surface.description).toMatch(/Use gh for GitHub URLs when available/i);
    expect(fetch?.surface.description).not.toMatch(/2,000 lines|50(?:\.0)?KB/i);
  });

  it("keeps the Context7 order in the fetch description, not its library_id field", () => {
    const docsFetch = surfaces.find(({ spec }) => spec.name === "web_docs_fetch");
    expect(docsFetch?.surface.description).toMatch(/Search first if the ID is unknown/i);

    const schema = docsFetch?.spec.parameters as {
      properties?: { library_id?: { description?: string } };
    };
    expect(schema.properties?.library_id?.description).not.toMatch(/search first/i);
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
