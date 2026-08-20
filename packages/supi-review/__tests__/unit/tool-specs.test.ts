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

  it("builds structurally complete parameter schemas", () => {
    // Guard against circular-import construction failures: a schema property
    // that is undefined at Type.Object time drops out of `properties` while
    // staying listed in `required`, which providers reject.
    const specs = [reviewRunSpec, reviewOutputSpec, reviewAuditSpec];
    for (const spec of specs) {
      const schema = spec.parameters as {
        type?: string;
        required?: string[];
        properties?: Record<string, { type?: string } | undefined>;
      };
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
      for (const name of schema.required ?? []) {
        expect(schema.properties, `${spec.name}: required property ${name} missing`).toHaveProperty(
          name,
        );
      }
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        expect(property, `${spec.name}: property ${name} is not a schema object`).toBeDefined();
        const hasShape =
          typeof property?.type === "string" ||
          "anyOf" in (property ?? {}) ||
          "oneOf" in (property ?? {}) ||
          "enum" in (property ?? {}) ||
          "const" in (property ?? {});
        expect(hasShape, `${spec.name}: property ${name} lacks a schema shape`).toBe(true);
      }
    }
  });
});
