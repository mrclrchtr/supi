import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { completedCodeQuery, type SemanticProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCapabilityAdapter } from "../../../src/session/capability-adapter.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";
import { resolveTargetWorkflow } from "../../../src/session/target-workflow.ts";

let cwd: string;
let store: Map<string, TargetStoreEntry>;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "target-kind-mismatch-"));
  writeFileSync(path.join(cwd, "a.ts"), "export const Widget = 1;\n");
  writeFileSync(path.join(cwd, "b.ts"), "export interface Widget {}\n");
  store = new Map();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function semanticProvider(): SemanticProvider {
  const symbols = [
    {
      name: "Widget",
      kind: "Variable",
      file: path.join(cwd, "a.ts"),
      declarationAnchor: { line: 1, character: 14 },
      nameAnchor: { line: 1, character: 14 },
      container: null,
      nesting: "top-level" as const,
    },
    {
      name: "Widget",
      kind: "Interface",
      file: path.join(cwd, "b.ts"),
      declarationAnchor: { line: 1, character: 18 },
      nameAnchor: { line: 1, character: 18 },
      container: null,
      nesting: "top-level" as const,
    },
  ];
  return {
    workspaceSymbols: async () => completedCodeQuery(symbols),
    documentSymbols: async (file) =>
      completedCodeQuery(symbols.filter((symbol) => symbol.file === file)),
    references: async () => completedCodeQuery([]),
    implementation: async () => completedCodeQuery([]),
  };
}

describe("target workflow symbol-kind mismatch", () => {
  it("registers only bounded near-match handles and preserves the mismatch kind", async () => {
    const capability = new TestCapabilityAdapter({ semantic: semanticProvider() });
    const outcome = await resolveTargetWorkflow(
      { symbol: { query: "Widget", symbolKind: "class" } },
      { fileLevelAllowed: false, nameAnchorRequired: false, maxResults: 1 },
      {
        cwd,
        capability,
        lookupTargetId: (targetId) => getWorkflowTarget(store, targetId),
        registerTarget: (input) => registerWorkflowTarget(store, cwd, input),
      },
    );

    expect(outcome).toMatchObject({
      kind: "kind-mismatch",
      requestedKind: "class",
      candidates: [
        {
          name: "Widget",
          kind: "Variable",
        },
      ],
      omittedCount: 1,
    });
    if (outcome.kind !== "kind-mismatch") return;
    expect(outcome.candidates[0]?.targetId).toMatch(/^tg-/);
    expect(outcome.candidates[0]).not.toHaveProperty("reason");
    expect(store).toHaveLength(1);
    expect([...store.values()][0]?.provenance).toEqual(["semantic"]);
  });
});
