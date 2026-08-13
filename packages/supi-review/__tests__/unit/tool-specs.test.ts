import { describe, expect, it } from "vitest";
import { REVIEW_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

describe("review tool specs", () => {
  it("keeps names unique and prompt guidelines explicit", () => {
    const specs = Object.values(REVIEW_TOOL_SPECS);
    expect(new Set(specs.map((spec) => spec.name)).size).toBe(specs.length);

    for (const spec of [REVIEW_TOOL_SPECS.run, REVIEW_TOOL_SPECS.output, REVIEW_TOOL_SPECS.audit]) {
      for (const guideline of spec.promptGuidelines) expect(guideline).toContain(spec.name);
    }
  });
});
