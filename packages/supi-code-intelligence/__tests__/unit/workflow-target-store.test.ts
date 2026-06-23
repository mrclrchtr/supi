/**
 * RED tests for the workflow target store.
 *
 * These tests assert behavioral expectations of the target store.
 * They will fail during Phase 1 RED because the stub returns empty IDs
 * and always-unavailable lookups.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllWorkflowTargets,
  clearWorkflowTargets,
  getWorkflowTarget,
  registerWorkflowTarget,
} from "../../src/workflow/target-store.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "wt-store-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearAllWorkflowTargets();
});

describe("workflow target store", () => {
  it("registers a target and returns a non-empty targetId and spanId", () => {
    const result = registerWorkflowTarget(tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
    });

    // These will fail with the Phase 1 stub (returns empty strings)
    expect(result.targetId).toBeDefined();
    expect(result.targetId.length).toBeGreaterThan(0);
    expect(result.spanId).toBeDefined();
    expect(result.spanId.length).toBeGreaterThan(0);
  });

  it("returns the same IDs when the same target is registered again with the same file fingerprint", () => {
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
    };

    const r1 = registerWorkflowTarget(tmpDir, input);
    const r2 = registerWorkflowTarget(tmpDir, input);

    // Will fail: stub returns empty IDs, so both are "" — but the
    // first assertion should fail before we reach the equality check
    expect(r1.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId).toBe(r1.targetId);
    expect(r2.spanId).toBe(r1.spanId);
  });

  it("looks up a stored target by targetId", async () => {
    mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    writeFileSync(path.join(tmpDir, "src", "index.ts"), "export const foo = 1;\n");

    const result = registerWorkflowTarget(tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
    });

    const lookup = getWorkflowTarget(tmpDir, result.targetId);

    // With stub, result.targetId is "" and getWorkflowTarget always
    // returns unavailable — this will fail
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
    const lookup = getWorkflowTarget(tmpDir, "unknown-target-id");

    expect(lookup.kind).toBe("unavailable");
    if (lookup.kind === "unavailable") {
      expect(lookup.reason.length).toBeGreaterThan(0);
    }
  });

  it("detects stale entries when the backing file fingerprint changes", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "index.ts"), "const foo = 1;\n");

    const r1 = registerWorkflowTarget(tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
    });

    // Will fail at length check with stub
    expect(r1.targetId.length).toBeGreaterThan(0);

    // Modify the file and re-register
    writeFileSync(path.join(tmpDir, "src", "index.ts"), "const foo = 2;\n");

    const r2 = registerWorkflowTarget(tmpDir, {
      file: path.join(tmpDir, "src/index.ts"),
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
      name: "foo",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
    });

    // File fingerprint changed, so IDs should differ
    expect(r2.targetId.length).toBeGreaterThan(0);
    expect(r2.targetId).not.toBe(r1.targetId);

    // The old targetId should now be stale
    const stale = getWorkflowTarget(tmpDir, r1.targetId);
    expect(stale.kind).toBe("unavailable");
    if (stale.kind === "unavailable") {
      expect(stale.reason).toContain("foo");
      expect(stale.reason).toContain("stale");
    }
  });

  it("clears all targets for a cwd without affecting unrelated cwds", () => {
    const otherDir = mkdtempSync(path.join(os.tmpdir(), "wt-store-other-"));
    try {
      writeFileSync(path.join(tmpDir, "a.ts"), "const a = 1;\n");
      writeFileSync(path.join(otherDir, "b.ts"), "const b = 2;\n");

      const r1 = registerWorkflowTarget(tmpDir, {
        file: path.join(tmpDir, "a.ts"),
        position: { line: 0, character: 0 },
        displayLine: 1,
        displayCharacter: 1,
        name: "a",
        kind: null,
        confidence: "heuristic",
        provenance: "file",
        anchorKind: "name",
      });
      const r2 = registerWorkflowTarget(otherDir, {
        file: path.join(otherDir, "b.ts"),
        position: { line: 0, character: 0 },
        displayLine: 1,
        displayCharacter: 1,
        name: "b",
        kind: null,
        confidence: "heuristic",
        provenance: "file",
        anchorKind: "name",
      });

      // First assertion to fail with stub
      expect(r1.targetId.length).toBeGreaterThan(0);
      expect(r2.targetId.length).toBeGreaterThan(0);

      clearWorkflowTargets(tmpDir);

      // tmpDir targets should be gone
      const stale = getWorkflowTarget(tmpDir, r1.targetId);
      expect(stale.kind).toBe("unavailable");

      // otherDir targets should survive
      const alive = getWorkflowTarget(otherDir, r2.targetId);
      expect(alive.kind).toBe("available");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("returns unavailable when backing file is deleted after registration", () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "temp.ts");
    writeFileSync(filePath, "const x = 1;\n");

    const r = registerWorkflowTarget(tmpDir, {
      file: filePath,
      position: { line: 0, character: 6 },
      displayLine: 1,
      displayCharacter: 7,
      name: "x",
      kind: "const",
      confidence: "semantic",
      provenance: "anchored",
      anchorKind: "name",
    });

    // Verify registered successfully
    const lookup1 = getWorkflowTarget(tmpDir, r.targetId);
    expect(lookup1.kind).toBe("available");

    // Delete the backing file
    rmSync(filePath, { force: true });

    // Lookup should now return unavailable
    const lookup2 = getWorkflowTarget(tmpDir, r.targetId);
    expect(lookup2.kind).toBe("unavailable");
  });

  it("returns unavailable when file was never readable (unfingerprinted rechecked at lookup)", () => {
    const missingFile = path.join(tmpDir, "nonexistent.ts");

    // Registration with a non-existent file stores "unfingerprinted"
    const r = registerWorkflowTarget(tmpDir, {
      file: missingFile,
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
      name: "ghost",
      kind: null,
      confidence: "heuristic",
      provenance: "file",
      anchorKind: "name",
    });

    // Lookup should detect the file is still missing → unavailable
    const lookup = getWorkflowTarget(tmpDir, r.targetId);
    expect(lookup.kind).toBe("unavailable");
    if (lookup.kind === "unavailable") {
      expect(lookup.reason).toContain("File not found");
    }
  });

  // ADR 0003 — targetId identity must not depend on the anchor position.
  it("reuses the same targetId when the same symbol is re-resolved at a different anchor position (position is not part of identity)", () => {
    // nameAnchor is best-effort: the same symbol can resolve to the identifier
    // (name anchor) on one call and fall back to the declaration anchor
    // (the `export` keyword) on another. If position were part of the identity
    // hash, re-resolution would yield a different targetId — violating the
    // documented "re-resolving the same target reuses the same IDs" invariant
    // and destabilizing plan/apply handles across re-resolve.
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "index.ts");
    writeFileSync(filePath, "export const foo = 1;\n");

    const base = {
      file: filePath,
      name: "foo",
      kind: "const",
      confidence: "semantic" as const,
      provenance: "symbol",
      anchorKind: "name" as const,
    };

    // Resolve #1: refine succeeded -> name anchor on the identifier (col 15).
    const r1 = registerWorkflowTarget(tmpDir, {
      ...base,
      position: { line: 0, character: 14 },
      displayLine: 1,
      displayCharacter: 15,
    });
    // Resolve #2: refine fell through -> declaration anchor on `export` (col 1).
    const r2 = registerWorkflowTarget(tmpDir, {
      ...base,
      position: { line: 0, character: 0 },
      displayLine: 1,
      displayCharacter: 1,
    });

    expect(r1.targetId.length).toBeGreaterThan(0);
    // The invariant: symbol identity is stable across anchor variance.
    // (spanId MAY differ — a span is a range — but targetId must not.)
    expect(r2.targetId).toBe(r1.targetId);
  });
});
