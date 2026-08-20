import { describe, expect, it } from "vitest";
import { promptGuidelines as auditGuidelines } from "../../src/tool/review_audit/guidance.ts";
import { reviewAuditSpec } from "../../src/tool/review_audit/spec.ts";
import { promptGuidelines as outputGuidelines } from "../../src/tool/review_output/guidance.ts";
import { reviewOutputSpec } from "../../src/tool/review_output/spec.ts";
import { REVIEW_TOOL_SPECS } from "../../src/tool/tool-specs.ts";

describe("review tool specs", () => {
  it("keeps names unique and prompt guidelines explicit", () => {
    const specs = [...Object.values(REVIEW_TOOL_SPECS), reviewOutputSpec, reviewAuditSpec];
    expect(new Set(specs.map((spec) => spec.name)).size).toBe(specs.length);

    const parentTools = [
      { spec: REVIEW_TOOL_SPECS.run, guidelines: REVIEW_TOOL_SPECS.run.promptGuidelines },
      { spec: reviewOutputSpec, guidelines: outputGuidelines },
      { spec: reviewAuditSpec, guidelines: auditGuidelines },
    ] as const;
    for (const { spec, guidelines } of parentTools) {
      for (const guideline of guidelines) expect(guideline).toContain(spec.name);
    }
  });
});
