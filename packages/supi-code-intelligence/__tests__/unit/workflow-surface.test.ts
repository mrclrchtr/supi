import { describe, expect, it } from "vitest";
import {
  WORKFLOW_CODE_TOOL_NAMES,
  WORKFLOW_CODE_TOOL_SCHEMAS,
  WORKFLOW_CODE_TOOL_SPECS,
} from "../../src/workflow/index.ts";

type SchemaCandidate = {
  enum?: unknown;
  const?: unknown;
  anyOf?: unknown[];
  oneOf?: unknown[];
  items?: unknown;
};

function asSchemaCandidate(schema: unknown): SchemaCandidate | null {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  return schema as SchemaCandidate;
}

function addEnumValues(values: Set<string>, items: unknown): void {
  if (!Array.isArray(items)) {
    return;
  }

  for (const value of items) {
    if (typeof value === "string") {
      values.add(value);
    }
  }
}

function collectNestedValues(values: Set<string>, schema: unknown): void {
  for (const value of collectStringValues(schema)) {
    values.add(value);
  }
}

function collectStringValues(schema: unknown): string[] {
  const candidate = asSchemaCandidate(schema);
  if (!candidate) {
    return [];
  }

  const values = new Set<string>();
  if (typeof candidate.const === "string") {
    values.add(candidate.const);
  }

  addEnumValues(values, candidate.enum);
  collectNestedValues(values, candidate.items);

  for (const branch of [candidate.anyOf, candidate.oneOf]) {
    if (!Array.isArray(branch)) {
      continue;
    }
    for (const entry of branch) {
      collectNestedValues(values, entry);
    }
  }

  return [...values];
}

const EXPECTED_WORKFLOW_TOOL_NAMES = [
  "code_resolve",
  "code_context",
  "code_find",
  "code_graph",
  "code_impact",
  "code_refactor",
  "code_apply",
  "code_health",
] as const;

describe("workflow surface skeleton", () => {
  it("defines the approved V2 workflow tool names exactly", () => {
    expect(WORKFLOW_CODE_TOOL_NAMES).toEqual(EXPECTED_WORKFLOW_TOOL_NAMES);
  });

  it("keeps planned workflow tool names free of lsp_ and tree_sitter_ prefixes", () => {
    const disallowedPrefixes = ["lsp_", "tree_sitter_"] as const;
    for (const name of WORKFLOW_CODE_TOOL_NAMES) {
      expect(disallowedPrefixes.some((prefix) => name.startsWith(prefix))).toBe(false);
    }
  });

  it("documents every planned tool with purpose, schema docs, absorbed tools/behaviors, phase, and non-goals", () => {
    expect(WORKFLOW_CODE_TOOL_SPECS).toHaveLength(WORKFLOW_CODE_TOOL_NAMES.length);

    const specNames = WORKFLOW_CODE_TOOL_SPECS.map((spec) => spec.name);
    expect(new Set(specNames).size).toBe(WORKFLOW_CODE_TOOL_NAMES.length);
    expect([...specNames].sort()).toEqual([...WORKFLOW_CODE_TOOL_NAMES].sort());
    expect(Object.keys(WORKFLOW_CODE_TOOL_SCHEMAS).sort()).toEqual(
      [...WORKFLOW_CODE_TOOL_NAMES].sort(),
    );

    for (const spec of WORKFLOW_CODE_TOOL_SPECS) {
      expect(spec.purpose.trim().length).toBeGreaterThan(0);
      expect(spec.schemaDocs.trim().length).toBeGreaterThan(0);
      expect(spec.phase.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(spec.absorbsTools)).toBe(true);
      expect(Array.isArray(spec.absorbsBehaviors)).toBe(true);
      expect(Array.isArray(spec.nonGoals)).toBe(true);
      expect(spec.nonGoals.length).toBeGreaterThan(0);
      expect(Object.hasOwn(WORKFLOW_CODE_TOOL_SCHEMAS, spec.schemaKey)).toBe(true);
    }
  });

  it("avoids a broad action parameter and reserves operation for code_refactor only", () => {
    for (const [name, schema] of Object.entries(WORKFLOW_CODE_TOOL_SCHEMAS)) {
      const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(properties).not.toHaveProperty("action");
      if (name === "code_refactor") {
        expect(properties).toHaveProperty("operation");
      } else {
        expect(properties).not.toHaveProperty("operation");
      }
    }
  });

  it("defines code_graph relations without a misleading callers label", () => {
    const graphSchema = WORKFLOW_CODE_TOOL_SCHEMAS.code_graph as {
      properties?: Record<string, unknown>;
    };
    const relationsSchema = graphSchema.properties?.relations;
    const values = collectStringValues(relationsSchema);

    expect(values).toEqual(
      expect.arrayContaining([
        "references",
        "callees",
        "imports",
        "exports",
        "implements",
        "tests",
      ]),
    );
    expect(values).not.toContain("callers");
  });

  it("defines code_find modes without a speculative natural-language mode", () => {
    const findSchema = WORKFLOW_CODE_TOOL_SCHEMAS.code_find as {
      properties?: Record<string, unknown>;
    };
    const modeSchema = findSchema.properties?.mode;
    const values = collectStringValues(modeSchema);

    expect(values).toEqual(expect.arrayContaining(["text", "regex", "ast", "semantic"]));
    expect(values).not.toContain("natural");
  });
});
