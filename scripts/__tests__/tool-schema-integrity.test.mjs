// Wire-shape integrity for every registered SuPi tool schema.
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
  // agent_build parameters depend on the runtime profile catalogue; the
  // factory with an unloaded catalogue is the canonical static shape.
  add("supi-agent", "agent_run", { ...m.agentRunSpec, parameters: m.buildAgentRunParameters() });
  m = await import(`${PACKAGES}/supi-web/src/tool/web_fetch_md/spec.ts`);
  add("supi-web", "web_fetch_md", m.webFetchMdSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_docs_search/spec.ts`);
  add("supi-web", "web_docs_search", m.webDocsSearchSpec);
  m = await import(`${PACKAGES}/supi-web/src/tool/web_docs_fetch/spec.ts`);
  add("supi-web", "web_docs_fetch", m.webDocsFetchSpec);
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
    expect(tools.length).toBeGreaterThanOrEqual(22);

    for (const { pkg, name, spec } of tools) {
      expect(spec.parameters, `${pkg} :: ${name} has no parameter schema`).toBeDefined();
      // Serialize exactly as the provider request does.
      const schema = JSON.parse(JSON.stringify(spec.parameters));
      expect(schema.type, `${pkg} :: ${name} top-level type`).toBe("object");
      for (const combinator of ["anyOf", "oneOf", "allOf", "enum", "const", "not"]) {
        expect(schema[combinator], `${pkg} :: ${name} top-level ${combinator}`).toBeUndefined();
      }

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
});
