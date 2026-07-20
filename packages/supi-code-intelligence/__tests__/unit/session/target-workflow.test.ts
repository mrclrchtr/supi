/**
 * Unit tests for the target-workflow module (deep session seam).
 *
 * Tests target resolution through the policy-driven `resolveTargetWorkflow`
 * function with a test capability adapter — no global runtime needed.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SemanticProvider, StructuralProvider } from "@mrclrchtr/supi-code-runtime/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CapabilityAdapter,
  TestCapabilityAdapter,
} from "../../../src/session/capability-adapter.ts";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetRegistrationInput,
  type TargetRegistrationOutput,
  type TargetStoreEntry,
} from "../../../src/session/target-store.ts";
import {
  resolveTargetWorkflow,
  type TargetWorkflowDeps,
  type TargetWorkflowPolicy,
} from "../../../src/session/target-workflow.ts";

let tmpDir: string;
let store: Map<string, TargetStoreEntry>;
let registerTarget: (input: TargetRegistrationInput) => TargetRegistrationOutput;

function buildDeps(adapter: CapabilityAdapter): TargetWorkflowDeps {
  return {
    cwd: tmpDir,
    capability: adapter,
    lookupTargetId: (id: string) => getWorkflowTarget(store, id),
    registerTarget: (input: TargetRegistrationInput) => registerTarget(input),
  };
}

const DEFAULT_POLICY: TargetWorkflowPolicy = {
  fileLevelAllowed: false,
  nameAnchorRequired: false,
};

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "target-workflow-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test-ws" }));
  store = new Map<string, TargetStoreEntry>();
  registerTarget = (input: TargetRegistrationInput) => registerWorkflowTarget(store, tmpDir, input);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(relPath: string, content: string): void {
  const absPath = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
}

function makeTestStructural(overrides: Partial<StructuralProvider> = {}): StructuralProvider {
  return {
    exports: async () => ({ kind: "success", data: [] }),
    outline: async () => ({ kind: "success", data: [] }),
    imports: async () => ({ kind: "success", data: [] }),
    calleesAt: async () => ({ kind: "runtime-error", message: "unused" }),
    nodeAt: async () => ({ kind: "runtime-error", message: "unused" }),
    callSites: async () => ({ kind: "success", data: [] }),
    ...overrides,
  };
}

function makeTestSemantic(
  symbols: Array<{
    name: string;
    kind: string;
    file: string;
    nameAnchor?: { line: number; character: number };
    declarationAnchor: { line: number; character: number };
    container?: string | null;
  }>,
): SemanticProvider {
  return {
    documentSymbols: async (file: string) =>
      symbols
        .filter((s) => s.file === file)
        .map((s) => ({
          name: s.name,
          kind: s.kind,
          file: s.file,
          declarationAnchor: s.declarationAnchor,
          nameAnchor: s.nameAnchor,
          container: s.container ?? null,
        })),
    workspaceSymbols: async () =>
      symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        file: s.file,
        declarationAnchor: s.declarationAnchor,
        nameAnchor: s.nameAnchor,
        container: s.container ?? null,
      })),
    references: async () => [],
    implementation: async () => [],
  };
}

describe("target-workflow (deep session seam)", () => {
  describe("handle lookup", () => {
    it("resolves a stored targetId and returns the entry", async () => {
      writeSource("src/mod.ts", "export const x = 1;\n");
      const { entry } = registerTarget({
        file: "src/mod.ts",
        position: { line: 0, character: 6 },
        displayLine: 1,
        displayCharacter: 7,
        name: "x",
        kind: "const",
        confidence: "semantic",
        provenance: ["semantic"] as const,
        anchorKind: "name",
        container: null,
      });

      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow({ handle: entry.targetId }, DEFAULT_POLICY, deps);

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind === "resolved") {
        expect(outcome.entry.targetId).toBe(entry.targetId);
        expect(outcome.entry.name).toBe("x");
        expect(outcome.entry.anchorKind).toBe("name");
        expect(outcome.entry.file).toContain("src/mod.ts");
      }
    });

    it("keeps a fresh handle usable by structural consumers after LSP loss", async () => {
      writeSource("src/mod.ts", "export const x = 1;\n");
      const { entry } = registerTarget({
        file: "src/mod.ts",
        position: { line: 0, character: 13 },
        displayLine: 1,
        displayCharacter: 14,
        name: "x",
        kind: "const",
        confidence: "semantic",
        provenance: ["semantic"] as const,
        anchorKind: "name",
        container: null,
      });
      const adapter = new TestCapabilityAdapter({
        readiness: { kind: "unavailable", reason: "LSP crashed" },
      });

      const outcome = await resolveTargetWorkflow(
        { handle: entry.targetId },
        DEFAULT_POLICY,
        buildDeps(adapter),
      );

      expect(outcome).toMatchObject({ kind: "resolved", entry: { targetId: entry.targetId } });
    });

    it("returns invalid-input for unknown targetId", async () => {
      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow({ handle: "tg-unknown" }, DEFAULT_POLICY, deps);

      expect(outcome.kind).toBe("invalid-input");
      if (outcome.kind === "invalid-input") {
        expect(outcome.message).toContain("not found");
      }
    });

    it("rejects selectors with more than one branch", async () => {
      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);
      const outcome = await resolveTargetWorkflow(
        { handle: "tg-any", file: "other.ts" } as never,
        DEFAULT_POLICY,
        deps,
      );
      expect(outcome.kind).toBe("invalid-input");
      if (outcome.kind === "invalid-input") {
        expect(outcome.message).toContain("exactly one");
      }
    });
  });

  describe("name-anchor policy", () => {
    it("refuses declaration-anchor target for name-anchor-required policy", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      const { entry } = registerTarget({
        file: "src/mod.ts",
        position: { line: 0, character: 0 },
        displayLine: 1,
        displayCharacter: 1,
        name: "foo",
        kind: "Function",
        confidence: "semantic",
        provenance: ["semantic"] as const,
        anchorKind: "declaration",
        container: null,
      });

      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { handle: entry.targetId },
        { ...DEFAULT_POLICY, nameAnchorRequired: true },
        deps,
      );

      expect(outcome.kind).toBe("invalid-input");
      if (outcome.kind === "invalid-input") {
        expect(outcome.message).toContain("declaration anchor");
      }
    });

    it("accepts name-anchor target for name-anchor-required policy", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      const { entry } = registerTarget({
        file: "src/mod.ts",
        position: { line: 0, character: 17 },
        displayLine: 1,
        displayCharacter: 18,
        name: "foo",
        kind: "Function",
        confidence: "semantic",
        provenance: ["semantic"] as const,
        anchorKind: "name",
        container: null,
      });

      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { handle: entry.targetId },
        { ...DEFAULT_POLICY, nameAnchorRequired: true },
        deps,
      );

      expect(outcome.kind).toBe("resolved");
    });
  });

  describe("symbol query", () => {
    it("resolves a unique symbol via workspace symbols", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      const semantic = makeTestSemantic([
        {
          name: "foo",
          kind: "Function",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: 1, character: 17 },
          nameAnchor: { line: 1, character: 17 },
        },
      ]);

      const adapter = new TestCapabilityAdapter({ semantic });
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { symbol: { query: "foo" } },
        DEFAULT_POLICY,
        deps,
      );

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind === "resolved") {
        expect(outcome.entry.name).toBe("foo");
        expect(outcome.entry.targetId).toMatch(/^tg-/);
      }
    });

    it("returns disambiguation for multiple matches", async () => {
      writeSource("src/a.ts", "export function bar() {}\n");
      writeSource("src/b.ts", "export function bar() {}\n");
      const semantic = makeTestSemantic([
        {
          name: "bar",
          kind: "Function",
          file: path.join(tmpDir, "src/a.ts"),
          declarationAnchor: { line: 1, character: 17 },
          nameAnchor: { line: 1, character: 17 },
        },
        {
          name: "bar",
          kind: "Function",
          file: path.join(tmpDir, "src/b.ts"),
          declarationAnchor: { line: 1, character: 17 },
          nameAnchor: { line: 1, character: 17 },
        },
      ]);

      const adapter = new TestCapabilityAdapter({ semantic });
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { symbol: { query: "bar" } },
        DEFAULT_POLICY,
        deps,
      );

      expect(outcome.kind).toBe("disambiguation");
      if (outcome.kind === "disambiguation") {
        expect(outcome.candidates).toHaveLength(2);
        expect(outcome.candidates[0]?.targetId).toMatch(/^tg-/);
      }
    });

    it("returns unavailable when no semantic provider", async () => {
      const adapter = new TestCapabilityAdapter({ semantic: null });
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { symbol: { query: "foo" } },
        DEFAULT_POLICY,
        deps,
      );

      expect(outcome.kind).toBe("unavailable");
      if (outcome.kind === "unavailable") {
        expect(outcome.reason).toContain("semantic provider");
      }
    });
  });

  describe("file-level policy", () => {
    it("rejects unsupported binary files as invalid input before semantic readiness", async () => {
      writeSource("image.png", "not-an-image");
      const outcome = await resolveTargetWorkflow(
        { file: "image.png" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true },
        buildDeps(
          new TestCapabilityAdapter({
            readiness: { kind: "unavailable", reason: "No semantic server" },
          }),
        ),
      );

      expect(outcome).toMatchObject({
        kind: "invalid-input",
        message: expect.stringContaining("PI read or grep"),
      });
    });

    it("rejects file-only input when fileLevelAllowed is false", async () => {
      writeSource("src/mod.ts", "export const x = 1;\n");
      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow({ file: "src/mod.ts" }, DEFAULT_POLICY, deps);

      expect(outcome.kind).toBe("invalid-input");
      if (outcome.kind === "invalid-input") {
        expect(outcome.message).toContain("requires a handle");
      }
    });

    it("resolves file-only input when fileLevelAllowed is true", async () => {
      writeSource("src/mod.ts", "export const x = 1;\n");
      const structural = {
        exports: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "x",
              kind: "const",
              startLine: 1,
              startCharacter: 14,
              endLine: 1,
              endCharacter: 15,
            },
          ],
        }),
        outline: async () => ({
          kind: "success" as const,
          data: [
            {
              name: "x",
              kind: "const",
              startLine: 1,
              startCharacter: 8,
              endLine: 1,
              endCharacter: 19,
            },
          ],
        }),
        imports: async () => ({ kind: "success" as const, data: [] }),
        calleesAt: async () => ({ kind: "unavailable" as const, message: "no" }),
        nodeAt: async () => ({ kind: "unavailable" as const, message: "no" }),
        callSites: async () => ({ kind: "unavailable" as const, message: "no" }),
      } as StructuralProvider;
      const adapter = new TestCapabilityAdapter({ structural });
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { file: "src/mod.ts" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true },
        deps,
      );

      expect(outcome.kind).toBe("target-group");
      if (outcome.kind === "target-group") {
        expect(outcome.file).toContain("src/mod.ts");
        expect(outcome.targets).toHaveLength(1);
        expect(outcome.targets[0]?.name).toBe("x");
        expect(outcome.targets[0]?.provenance).toEqual(["structural"]);
        expect(outcome.targets[0]?.position).not.toEqual({ line: 0, character: 0 });
      }
    });

    it("keeps overload declarations on distinct member handles", async () => {
      writeSource(
        "src/mod.ts",
        "export function same(): void; export function same(value: string): void;\n",
      );
      const semantic = makeTestSemantic([
        {
          name: "same",
          kind: "Function",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
        },
        {
          name: "same",
          kind: "Function",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: 1, character: 31 },
          nameAnchor: { line: 1, character: 47 },
        },
      ]);
      const deps = buildDeps(new TestCapabilityAdapter({ semantic }));
      const outcome = await resolveTargetWorkflow(
        { file: "src/mod.ts" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true },
        deps,
      );

      expect(outcome.kind).toBe("target-group");
      if (outcome.kind !== "target-group") return;
      expect(new Set(outcome.targets.map((target) => target.targetId))).toHaveLength(2);
      expect(outcome.targets.map((target) => target.displayLine)).toEqual([1, 1]);
      expect(outcome.targets.map((target) => target.provenance)).toEqual([
        ["semantic"],
        ["semantic"],
      ]);

      const anchored = await resolveTargetWorkflow(
        { anchor: { file: "src/mod.ts", line: 1, character: 47 } },
        DEFAULT_POLICY,
        deps,
      );
      expect(anchored).toMatchObject({
        kind: "resolved",
        entry: { targetId: outcome.targets[1]?.targetId, displayCharacter: 47 },
      });
    });

    it("reuses a structural member handle when semantic facts appear later", async () => {
      writeSource("src/mod.ts", "const helper = () => 1;\n");
      const structural = makeTestStructural({
        outline: async () => ({
          kind: "success",
          data: [
            {
              name: "helper",
              kind: "function",
              startLine: 1,
              startCharacter: 7,
              endLine: 1,
              endCharacter: 24,
            },
          ],
        }),
      });
      const first = await resolveTargetWorkflow(
        { file: "src/mod.ts" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true },
        buildDeps(new TestCapabilityAdapter({ semantic: makeTestSemantic([]), structural })),
      );
      expect(first.kind).toBe("target-group");
      if (first.kind !== "target-group") return;

      const semantic = makeTestSemantic([
        {
          name: "helper",
          kind: "Variable",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 7 },
        },
      ]);
      const refined = await resolveTargetWorkflow(
        { file: "src/mod.ts" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true },
        buildDeps(new TestCapabilityAdapter({ semantic, structural })),
      );
      expect(refined.kind).toBe("target-group");
      if (refined.kind !== "target-group") return;

      expect(refined.targets[0]?.targetId).toBe(first.targets[0]?.targetId);
      expect(refined.targets[0]).toMatchObject({
        kind: "Variable",
        anchorKind: "name",
        confidence: "semantic",
        provenance: ["semantic", "structural"] as const,
      });
    });

    it("registers only bounded group members while retaining exact completeness", async () => {
      writeSource("src/mod.ts", "const one = 1;\nconst two = 2;\nconst three = 3;\n");
      const semantic = makeTestSemantic(
        ["one", "two", "three"].map((name, index) => ({
          name,
          kind: "Variable",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: index + 1, character: 1 },
          nameAnchor: { line: index + 1, character: 7 },
        })),
      );
      const outcome = await resolveTargetWorkflow(
        { file: "src/mod.ts" },
        { ...DEFAULT_POLICY, fileLevelAllowed: true, maxResults: 1 },
        buildDeps(new TestCapabilityAdapter({ semantic })),
      );

      expect(outcome.kind).toBe("target-group");
      if (outcome.kind !== "target-group") return;
      expect(outcome.targets).toHaveLength(1);
      expect(store).toHaveLength(1);
      expect(outcome.totalCount).toBe(3);
      expect(outcome.omittedCount).toBe(2);
    });
  });

  describe("exact-one validation", () => {
    it("rejects an empty selector", async () => {
      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow({} as never, DEFAULT_POLICY, deps);
      expect(outcome.kind).toBe("invalid-input");
    });
  });

  describe("anchored resolution", () => {
    it("resolves anchored coordinates via LSP symbols", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      const semantic = makeTestSemantic([
        {
          name: "foo",
          kind: "Function",
          file: path.join(tmpDir, "src/mod.ts"),
          declarationAnchor: { line: 1, character: 1 },
          nameAnchor: { line: 1, character: 17 },
        },
      ]);

      const adapter = new TestCapabilityAdapter({ semantic });
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { anchor: { file: "src/mod.ts", line: 1, character: 17 } },
        DEFAULT_POLICY,
        deps,
      );

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind === "resolved") {
        expect(outcome.entry.name).toBe("foo");
        expect(outcome.entry.anchorKind).toBe("name");
      }
    });

    it("requires LSP readiness before structural anchor supplementation", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      let structuralCalls = 0;
      const structural = makeTestStructural({
        nodeAt: async () => {
          structuralCalls++;
          return {
            kind: "success",
            data: {
              type: "identifier",
              startLine: 1,
              startCharacter: 17,
              endLine: 1,
              endCharacter: 20,
              text: "foo",
              ancestry: [
                {
                  type: "function_declaration",
                  startLine: 1,
                  startCharacter: 8,
                  endLine: 1,
                  endCharacter: 25,
                },
              ],
            },
          };
        },
      });
      const adapter = new TestCapabilityAdapter({
        structural,
        readiness: { kind: "unavailable", reason: "LSP disabled" },
      });

      const outcome = await resolveTargetWorkflow(
        { anchor: { file: "src/mod.ts", line: 1, character: 17 } },
        DEFAULT_POLICY,
        buildDeps(adapter),
      );

      expect(outcome).toEqual({ kind: "unavailable", reason: "LSP disabled" });
      expect(structuralCalls).toBe(0);
    });

    it("allows structural anchor supplementation after LSP readiness", async () => {
      writeSource("src/mod.ts", "export function foo() {}\n");
      const semantic = makeTestSemantic([]);
      const structural = makeTestStructural({
        nodeAt: async () => ({
          kind: "success",
          data: {
            type: "identifier",
            startLine: 1,
            startCharacter: 17,
            endLine: 1,
            endCharacter: 20,
            text: "foo",
            ancestry: [
              {
                type: "function_declaration",
                startLine: 1,
                startCharacter: 8,
                endLine: 1,
                endCharacter: 25,
              },
            ],
          },
        }),
      });
      const adapter = new TestCapabilityAdapter({
        semantic,
        structural,
        readiness: { kind: "ready" },
      });

      const outcome = await resolveTargetWorkflow(
        { anchor: { file: "src/mod.ts", line: 1, character: 17 } },
        DEFAULT_POLICY,
        buildDeps(adapter),
      );

      expect(outcome).toMatchObject({
        kind: "resolved",
        entry: { name: "foo", anchorKind: "name", confidence: "structural" },
      });
    });

    it("returns invalid-input for non-existent file", async () => {
      const adapter = new TestCapabilityAdapter({});
      const deps = buildDeps(adapter);

      const outcome = await resolveTargetWorkflow(
        { anchor: { file: "nonexistent.ts", line: 1, character: 1 } },
        DEFAULT_POLICY,
        deps,
      );

      expect(outcome.kind).toBe("invalid-input");
      if (outcome.kind === "invalid-input") {
        expect(outcome.message).toContain("not found");
      }
    });
  });
});
