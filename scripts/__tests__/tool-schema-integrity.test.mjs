// Wire-shape integrity for every registered SuPi tool schema, plus the completeness and
// coherence of each spec's annotation hints.
//
// Provider APIs reject function schemas whose top level is not a plain
// object, and a corrupted build (for example an import cycle that leaves a
// schema binding undefined at module-evaluation time) can emit `required`
// entries with no matching `properties` entry. Biome's noImportCycles guards
// the root cause statically; this test asserts the emitted shape directly so
// any future corruption surface fails verification regardless of cause.

import { describe, expect, it } from "vitest";

const PACKAGES = new URL("../../packages", import.meta.url).pathname;

async function collectTools() {
  const tools = [];
  const add = (pkg, name, spec) => tools.push({ pkg, name, spec });

  let m;
  m = await import(`${PACKAGES}/supi-ask-user/src/tool/ask_user/spec.ts`);
  add("supi-ask-user", "ask_user", m.askUserSpec);
  m = await import(`${PACKAGES}/supi-cache/src/tool/cache_forensics/spec.ts`);
  add("supi-cache", "cache_forensics", m.cacheForensicsSpec);
  m = await import(`${PACKAGES}/supi-context/src/tool/context_report/spec.ts`);
  add("supi-context", "context_report", m.contextReportSpec);
  m = await import(`${PACKAGES}/supi-debug/src/tool/debug/spec.ts`);
  add("supi-debug", "debug", m.debugSpec);
  m = await import(`${PACKAGES}/supi-agent/src/tool/agent_run/spec.ts`);
  // agent_run parameters depend on the runtime profile catalogue; the
  // factory with an unloaded catalogue is the canonical static shape.
  add("supi-agent", "agent_run", { ...m.agentRunSpec, parameters: m.buildAgentRunParameters() });
  m = await import(`${PACKAGES}/supi-agent/src/tool/agent_list/spec.ts`);
  add("supi-agent", "agent_list", m.agentListSpec);
  m = await import(`${PACKAGES}/supi-agent/src/tool/agent_result/spec.ts`);
  add("supi-agent", "agent_result", m.agentResultSpec);
  m = await import(`${PACKAGES}/supi-agent/src/tool/agent_cancel/spec.ts`);
  add("supi-agent", "agent_cancel", m.agentCancelSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_fetch_md/spec.ts`);
  add("supi-web", "web_fetch_md", m.webFetchMdSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_docs_search/spec.ts`);
  add("supi-web", "web_docs_search", m.webDocsSearchSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_docs_fetch/spec.ts`);
  add("supi-web", "web_docs_fetch", m.webDocsFetchSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_search/spec.ts`);
  add("supi-web", "web_search", m.webSearchSpec);
  m = await import(`${PACKAGES}/supi-review/src/tool/review_run/spec.ts`);
  add("supi-review", "review_run", m.reviewRunSpec);
  m = await import(`${PACKAGES}/supi-review/src/tool/review_output/spec.ts`);
  add("supi-review", "review_output", m.reviewOutputSpec);
  m = await import(`${PACKAGES}/supi-review/src/tool/review_audit/spec.ts`);
  add("supi-review", "review_audit", m.reviewAuditSpec);
  m = await import(`${PACKAGES}/supi-review/src/tool/review_run/child-tools.ts`);
  for (const spec of Object.values(m.REVIEW_CHILD_TOOL_SPECS)) add("supi-review", spec.name, spec);
  m = await import(`${PACKAGES}/supi-code-intelligence/src/tool/specs.ts`);
  for (const spec of m.CODE_INTELLIGENCE_TOOL_SPECS) add("supi-code-intelligence", spec.name, spec);

  return tools;
}

describe("tool schema wire integrity", () => {
  it("emits a provider-valid object schema for every registered tool", {
    timeout: 20_000,
  }, async () => {
    const tools = await collectTools();
    expect(tools.length).toBeGreaterThanOrEqual(23);

    for (const { pkg, name, spec } of tools) {
      expect(spec.parameters, `${pkg} :: ${name} has no parameter schema`).toBeDefined();
      // Serialize exactly as the provider request does.
      const schema = JSON.parse(JSON.stringify(spec.parameters));
      expect(schema.type, `${pkg} :: ${name} top-level type`).toBe("object");
      for (const combinator of ["anyOf", "oneOf", "allOf", "enum", "const", "not"]) {
        expect(schema[combinator], `${pkg} :: ${name} top-level ${combinator}`).toBeUndefined();
      }

      // TypeBox keeps "~kind"/"~optional" non-enumerable. Spreading a schema into a plain
      // object and wrapping it in Type.Optional() makes the marker enumerable, so it would
      // reach the provider as an unknown keyword.
      expect(JSON.stringify(schema), `${pkg} :: ${name} leaks a TypeBox marker`).not.toContain(
        '"~',
      );

      const properties = schema.properties ?? {};
      for (const required of schema.required ?? []) {
        expect(
          properties,
          `${pkg} :: ${name} required "${required}" missing from properties`,
        ).toHaveProperty(required);
      }
      for (const [property, value] of Object.entries(properties)) {
        expect(value, `${pkg} :: ${name} property "${property}" is not a schema object`).toEqual(
          expect.any(Object),
        );
        const hasShape =
          typeof value.type === "string" ||
          "anyOf" in value ||
          "oneOf" in value ||
          "enum" in value ||
          "const" in value;
        expect(hasShape, `${pkg} :: ${name} property "${property}" lacks a schema shape`).toBe(
          true,
        );
      }
    }
  });

  it("declares a complete, coherent annotation set on every registered tool", {
    timeout: 20_000,
  }, async () => {
    const tools = await collectTools();
    // consulting_run builds parameters from a runtime catalogue, so it is not in the schema list.
    const consulting = await import(`${PACKAGES}/supi-consulting/src/tool/consulting_run/spec.ts`);
    tools.push({
      pkg: "supi-consulting",
      name: "consulting_run",
      spec: consulting.consultingRunSpec,
    });

    for (const { pkg, name, spec } of tools) {
      const hints = spec.annotations;
      const label = `${pkg} :: ${name}`;
      // Missing hints fall back to the pessimistic MCP defaults, so every hint must be explicit.
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
        expect(typeof hints?.[hint], `${label} ${hint}`).toBe("boolean");
      }
      if (hints.readOnlyHint) {
        expect(hints.destructiveHint, `${label} read-only yet destructive`).toBe(false);
        expect(hints.idempotentHint, `${label} read-only yet not idempotent`).toBe(true);
      }
      // Web tools and external consultations reach services outside the workspace.
      if (name.startsWith("web_") || name === "consulting_run") {
        expect(hints.openWorldHint, `${label} openWorldHint`).toBe(true);
      }
    }

    const byName = new Map(tools.map(({ name, spec }) => [name, spec.annotations]));
    // The only SuPi tool that overwrites workspace files.
    expect(byName.get("code_refactor_apply")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    // Plans preview edits without writing files.
    expect(byName.get("code_refactor_plan")).toMatchObject({ readOnlyHint: true });
  });
});
