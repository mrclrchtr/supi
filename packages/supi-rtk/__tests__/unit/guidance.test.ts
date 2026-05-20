import { describe, expect, it } from "vitest";
import { promptGuidelines } from "../../src/tool/guidance.ts";

describe("rtk guidance", () => {
  it("exports the RTK-specific bash override guideline", () => {
    expect(promptGuidelines).toHaveLength(1);
    expect(promptGuidelines[0]).toContain("bash");
    expect(promptGuidelines[0]).toContain("RTK");
    expect(promptGuidelines[0]).toContain("RTK_DISABLED=1");
  });
});
