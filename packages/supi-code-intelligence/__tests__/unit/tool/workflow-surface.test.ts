import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { CODE_FIND_AST_KINDS } from "../../../src/tool/code_find/ast-kinds.ts";
import {
  CODE_INTELLIGENCE_TOOL_SCHEMAS,
  CODE_INTELLIGENCE_TOOL_SPECS,
} from "../../../src/tool/specs.ts";
import { CODE_INTELLIGENCE_TOOL_NAMES } from "../../../src/types/index.ts";

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
  "code_inspect",
  "code_orientation",
  "code_find",
  "code_graph",
  "code_refactor_plan",
  "code_refactor_apply",
  "code_health",
] as const;

describe("code intelligence tool specs", () => {
  it("defines the approved code intelligence tool names exactly", () => {
    expect(CODE_INTELLIGENCE_TOOL_NAMES).toEqual(EXPECTED_WORKFLOW_TOOL_NAMES);
  });

  it("keeps planned tool names free of lsp_ and tree_sitter_ prefixes", () => {
    const disallowedPrefixes = ["lsp_", "tree_sitter_"] as const;
    for (const name of CODE_INTELLIGENCE_TOOL_NAMES) {
      expect(disallowedPrefixes.some((prefix) => name.startsWith(prefix))).toBe(false);
    }
  });

  it("registers one spec per tool name with a matching schema", () => {
    expect(CODE_INTELLIGENCE_TOOL_SPECS).toHaveLength(CODE_INTELLIGENCE_TOOL_NAMES.length);

    const specNames = CODE_INTELLIGENCE_TOOL_SPECS.map((spec) => spec.name);
    expect(new Set(specNames).size).toBe(CODE_INTELLIGENCE_TOOL_NAMES.length);
    expect([...specNames].sort()).toEqual([...CODE_INTELLIGENCE_TOOL_NAMES].sort());
    expect(Object.keys(CODE_INTELLIGENCE_TOOL_SCHEMAS).sort()).toEqual(
      [...CODE_INTELLIGENCE_TOOL_NAMES].sort(),
    );

    for (const spec of CODE_INTELLIGENCE_TOOL_SPECS) {
      expect(Object.hasOwn(CODE_INTELLIGENCE_TOOL_SCHEMAS, spec.name)).toBe(true);
    }
  });

  it("avoids a broad action parameter and reserves operation for code_refactor_plan only", () => {
    for (const [name, schema] of Object.entries(CODE_INTELLIGENCE_TOOL_SCHEMAS)) {
      const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(properties).not.toHaveProperty("action");
      if (name === "code_refactor_plan") {
        expect(properties).toHaveProperty("operation");
      } else {
        expect(properties).not.toHaveProperty("operation");
      }
    }
  });

  it("defines code_graph relations without a misleading callers label", () => {
    const graphSchema = CODE_INTELLIGENCE_TOOL_SCHEMAS.code_graph as {
      properties?: Record<string, unknown>;
    };
    const relationsSchema = graphSchema.properties?.relations;
    const values = collectStringValues(relationsSchema);

    expect(values.sort((left, right) => left.localeCompare(right))).toEqual([
      "all",
      "callees",
      "implements",
      "references",
    ]);
    expect(values).not.toContain("callers");
    expect(values).not.toContain("tests");
    expect(values).not.toContain("imports");
    expect(values).not.toContain("exports");
  });

  it("defines only required code-aware code_find modes", () => {
    const findSchema = CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const modeSchema = findSchema.properties?.mode;
    const values = collectStringValues(modeSchema);

    expect(values.sort((left, right) => left.localeCompare(right))).toEqual(["ast", "semantic"]);
    expect(findSchema.required).toContain("mode");
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, { query: "target" })).toBe(false);
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, { query: "target", mode: "text" })).toBe(
      false,
    );
    expect(
      Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, {
        query: "target",
        mode: "semantic",
        contextLines: 1,
      }),
    ).toBe(false);
    expect(
      Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, {
        query: "target",
        mode: "semantic",
        scope: ["src", "src"],
      }),
    ).toBe(true);
  });

  it("restricts code_find AST kinds to the supported structural vocabulary", () => {
    const findSchema = CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find as {
      properties?: Record<string, unknown>;
    };
    const kindSchema = findSchema.properties?.kind;
    const schemaValues = collectStringValues(kindSchema).sort((left, right) =>
      left.localeCompare(right),
    );

    expect(CODE_FIND_AST_KINDS).toHaveLength(9);
    expect(schemaValues).toEqual(
      [...CODE_FIND_AST_KINDS].sort((left, right) => left.localeCompare(right)),
    );
    for (const kind of CODE_FIND_AST_KINDS) {
      expect(
        Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, { query: "target", mode: "ast", kind }),
      ).toBe(true);
    }
    expect(
      Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_find, {
        query: "target",
        mode: "ast",
        kind: "test",
      }),
    ).toBe(false);
  });

  it("restricts code_health to its live section vocabulary", () => {
    const healthSchema = CODE_INTELLIGENCE_TOOL_SCHEMAS.code_health as {
      additionalProperties?: boolean;
      properties?: Record<string, unknown>;
    };
    const properties = healthSchema.properties ?? {};
    const values = collectStringValues(properties.include).sort((left, right) =>
      left.localeCompare(right),
    );

    expect(healthSchema.additionalProperties).toBe(false);
    expect(Object.keys(properties).sort()).toEqual(["include", "level", "refresh", "scope"]);
    expect(values).toEqual(["diagnostics", "servers"]);
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_health, { include: ["coverage"] })).toBe(
      false,
    );
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_health, { include: ["unused"] })).toBe(false);
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_health, { coveragePath: "report.json" })).toBe(
      false,
    );
    expect(Check(CODE_INTELLIGENCE_TOOL_SCHEMAS.code_health, { unusedPath: "report.json" })).toBe(
      false,
    );
  });
});
