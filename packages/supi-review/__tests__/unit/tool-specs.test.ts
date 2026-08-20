import { describe, expect, it } from "vitest";
import { promptGuidelines as auditGuidelines } from "../../src/tool/review_audit/guidance.ts";
import { reviewAuditSpec } from "../../src/tool/review_audit/spec.ts";
import { promptGuidelines as outputGuidelines } from "../../src/tool/review_output/guidance.ts";
import { reviewOutputSpec } from "../../src/tool/review_output/spec.ts";
import { REVIEW_CHILD_TOOL_SPECS } from "../../src/tool/review_run/child-tools.ts";
import { promptGuidelines as runGuidelines } from "../../src/tool/review_run/guidance.ts";
import { reviewRunSpec } from "../../src/tool/review_run/spec.ts";

describe("review tool specs", () => {
  it("keeps names unique and prompt guidelines explicit", () => {
    const specs = [
      reviewRunSpec,
      reviewOutputSpec,
      reviewAuditSpec,
      ...Object.values(REVIEW_CHILD_TOOL_SPECS),
    ];
    expect(new Set(specs.map((spec) => spec.name)).size).toBe(specs.length);

    const parentTools = [
      { spec: reviewRunSpec, guidelines: runGuidelines },
      { spec: reviewOutputSpec, guidelines: outputGuidelines },
      { spec: reviewAuditSpec, guidelines: auditGuidelines },
    ] as const;
    for (const { spec, guidelines } of parentTools) {
      for (const guideline of guidelines) expect(guideline).toContain(spec.name);
    }
  });
});
