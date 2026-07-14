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
  waitForSemantic: false,
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
        provenance: "test",
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
        provenance: "test",
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
        provenance: "test",
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
        outline: async () => ({ kind: "success" as const, data: [] }),
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

      expect(outcome.kind).toBe("resolved");
      if (outcome.kind === "resolved") {
        expect(outcome.entry.file).toContain("src/mod.ts");
      }
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
