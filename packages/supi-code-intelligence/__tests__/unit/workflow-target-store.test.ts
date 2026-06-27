/**
 * Tests for the workflow target store.
 *
 * Verifies that target registration, lookup, staleness detection,
 * and cross-cwd isolation work correctly through session-scoped stores.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getWorkflowTarget,
  registerWorkflowTarget,
  type TargetStoreEntry,
} from "../../src/session/target-store.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "wt-store-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createStore(): Map<string, TargetStoreEntry> {
  return new Map();
}

describe("workflow target store", () => {
  it("registers a target and returns a non-empty targetId and spanId", () => {
    const store = createStore();
    const result = registerWorkflowTarget(store, tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
      container: null,
    });

    expect(result.targetId).toBeDefined();
    expect(result.targetId.length).toBeGreaterThan(0);
    expect(result.spanId).toBeDefined();
    expect(result.spanId.length).toBeGreaterThan(0);
  });

  it("returns the same IDs when the same target is registered again with the same file fingerprint", () => {
    const store = createStore();
    const input = {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic" as const,
      provenance: "anchored",
      anchorKind: "name" as const,
      container: null,
    };

    const r1 = registerWorkflowTarget(store, tmpDir, input);
    const r2 = registerWorkflowTarget(store, tmpDir, input);

    expect(r1.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId).toBe(r1.targetId);
    expect(r2.spanId).toBe(r1.spanId);
  });

  it("looks up a stored target by targetId", async () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src", "index.ts"), "export const foo = 1;\n");

    const store = createStore();
    const result = registerWorkflowTarget(store, tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
      container: null,
    });

    const lookup = getWorkflowTarget(store, result.targetId);

    expect(lookup.kind).toBe("available");
    if (lookup.kind === "available") {
      expect(lookup.entry.targetId).toBe(result.targetId);
      expect(lookup.entry.file).toContain("index.ts");
      expect(lookup.entry.confidence).toBe("semantic");
      expect(lookup.entry.name).toBe("foo");
      expect(lookup.entry.kind).toBe("const");
      expect(lookup.entry.displayLine).toBe(1);
      expect(lookup.entry.displayCharacter).toBe(15);
      expect(lookup.entry.provenance).toBe("anchored");
    }
  });

  it("rejects an unknown targetId with an explicit unavailable result", () => {
    const store = createStore();
    const lookup = getWorkflowTarget(store, "unknown-target-id");

    expect(lookup.kind).toBe("unavailable");
    if (lookup.kind === "unavailable") {
      expect(lookup.reason.length).toBeGreaterThan(0);
    }
  });

  it("detects stale entries when the backing file fingerprint changes", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "index.ts"), "const foo = 1;\n");

    const store = createStore();
    const r1 = registerWorkflowTarget(store, tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
      container: null,
    });

    expect(r1.targetId.length).toBeGreaterThan(0);

    // Modify the file and re-register
    writeFileSync(path.join(tmpDir, "src", "index.ts"), "const foo = 2;\n");

    const r2 = registerWorkflowTarget(store, tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
      container: null,
    });

    // File fingerprint changed, so IDs should differ
    expect(r2.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId).not.toBe(r1.targetId);

    // The old targetId should now be stale
    const stale = getWorkflowTarget(store, r1.targetId);
    expect(stale.kind).toBe("unavailable");
    if (stale.kind === "unavailable") {
      expect(stale.reason).toContain("foo");
      expect(stale.reason).toContain("stale");
    }
  });

  it("isolates targets across different stores (simulating different cwds)", () => {
    const otherDir = mkdtempSync(path.join(os.tmpdir(), "wt-store-other-"));
    try {
      writeFileSync(path.join(tmpDir, "a.ts"), "const a = 1;\n");
      writeFileSync(path.join(otherDir, "b.ts"), "const b = 2;\n");

      const storeA = createStore();
      const storeB = createStore();

      const r1 = registerWorkflowTarget(storeA, tmpDir, {
        file: path.join(tmpDir, "a.ts"),
        position: { line: 0, character: 0 },
        displayLine: 1,
        displayCharacter: 1,
        name: "a",
        kind: null,
        confidence: "heuristic",
        provenance: "file",
        anchorKind: "name",
        container: null,
      });
      const r2 = registerWorkflowTarget(storeB, otherDir, {
        file: path.join(otherDir, "b.ts"),
        position: { line: 0, character: 0 },
        displayLine: 1,
        displayCharacter: 1,
        name: "b",
        kind: null,
        confidence: "heuristic",
        provenance: "file",
        anchorKind: "name",
        container: null,
      });

      expect(r1.targetId.length).toBeGreaterThan(0);
      expect(r2.targetId.length).toBeGreaterThan(0);

      // storeA should not contain r2's target
      const notInA = getWorkflowTarget(storeA, r2.targetId);
      expect(notInA.kind).toBe("unavailable");

      // storeB should not contain r1's target
      const notInB = getWorkflowTarget(storeB, r1.targetId);
      expect(notInB.kind).toBe("unavailable");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("returns unavailable when backing file is deleted after registration", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "temp.ts");
    writeFileSync(filePath, "const x = 1;\n");

    const store = createStore();
    const r = registerWorkflowTarget(store, tmpDir, {
      file: filePath,
      position: { line: 0, character: 6 },
      displayLine: 1,
      displayCharacter: 7,
      name: "x",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
      container: null,
    });

    // Verify registered successfully
    const lookup1 = getWorkflowTarget(store, r.targetId);
    expect(lookup1.kind).toBe("available");

    // Delete the backing file
    rmSync(filePath, { force: true });

    // Lookup should now return unavailable
    const lookup2 = getWorkflowTarget(store, r.targetId);
    expect(lookup2.kind).toBe("unavailable");
  });

  it("returns unavailable when file was never readable (unfingerprinted rechecked at lookup)", () => {
    const missingFile = path.join(tmpDir, "nonexistent.ts");
    const store = createStore();

    // Registration with a non-existent file stores "unfingerprinted"
    const r = registerWorkflowTarget(store, tmpDir, {
      file: missingFile,
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
      name: "ghost",
      kind: null,
      confidence: "heuristic",
      provenance: "file",
      anchorKind: "name",
      container: null,
    });

    // Lookup should detect the file is still missing → unavailable
    const lookup = getWorkflowTarget(store, r.targetId);
    expect(lookup.kind).toBe("unavailable");
    if (lookup.kind === "unavailable") {
      expect(lookup.reason).toContain("File not found");
    }
  });

  // ADR 0003 — targetId identity must not depend on the anchor position.
  it("reuses the same targetId when the same symbol is re-resolved at a different anchor position (position is not part of identity)", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "index.ts");
    writeFileSync(filePath, "export const foo = 1;\n");

    const store = createStore();
    const base = {
      file: filePath,
      name: "foo",
      kind: "const",
      confidence: "semantic" as const,
      provenance: "symbol",
      anchorKind: "name" as const,
      container: null,
    };

    // Resolve #1: refine succeeded -> name anchor on the identifier (col 15).
    const r1 = registerWorkflowTarget(store, tmpDir, {
      ...base,
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
    });
    // Resolve #2: refine fell through -> declaration anchor on `export` (col 1).
    const r2 = registerWorkflowTarget(store, tmpDir, {
      ...base,
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
    });

    expect(r1.targetId.length).toBeGreaterThan(0);
    // The invariant: symbol identity is stable across anchor variance.
    expect(r2.targetId).toBe(r1.targetId);
  });

  // ADR 0003, slice B2 — container distinguishes same-name same-file symbols.
  it("produces different targetIds for identical name+kind+file but different containers", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "index.ts");
    writeFileSync(filePath, "export class A { foo() {} } export class B { foo() {} }\n");

    const store = createStore();
    const base = {
      file: filePath,
      name: "foo",
      kind: "Method",
      confidence: "semantic" as const,
      provenance: "symbol",
      anchorKind: "name" as const,
      position: { line: 0, character: 10 },
    };

    const rA = registerWorkflowTarget(store, tmpDir, {
      ...base,
      container: "A",
      displayLine: 1,
      displayCharacter: 20,
    });
    const rB = registerWorkflowTarget(store, tmpDir, {
      ...base,
      container: "B",
      displayLine: 1,
      displayCharacter: 40,
    });

    expect(rA.targetId).not.toBe(rB.targetId);
  });
});
