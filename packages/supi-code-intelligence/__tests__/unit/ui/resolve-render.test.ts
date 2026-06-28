import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  DisambiguationCandidate,
  ResolveServiceResult,
} from "../../../src/analysis/target/service.ts";
import type { TargetStoreEntry } from "../../../src/session/target-store.ts";
import { renderResolveResult } from "../../../src/tool/resolve/markdown.ts";
import type { AnchoredResolutionMetadata } from "../../../src/types/index.ts";

const CWD = "/cwd";

function resolvedEntry(overrides: Partial<TargetStoreEntry> = {}): TargetStoreEntry {
  return {
    targetId: "tg-abc",
    spanId: "sp-abc",
    file: resolve(CWD, "src/widget.ts"),
    position: { line: 0, character: 16 },
    displayLine: 1,
    displayCharacter: 17,
    name: "widget",
    kind: "Function",
    anchorKind: "name",
    confidence: "semantic",
    provenance: "anchored",
    fileFingerprint: "abc123",
    container: null,
    resolution: undefined,
    ...overrides,
  };
}

function resolution(
  snapped: boolean,
  source: AnchoredResolutionMetadata["source"],
): AnchoredResolutionMetadata {
  return {
    requested: { line: 1, character: 1 },
    resolved: { line: 1, character: 17 },
    snapped,
    source,
  };
}

describe("renderResolveResult — anchored resolution notes", () => {
  it("shows a snap note when the target was snapped from the requested coordinate", () => {
    const result: ResolveServiceResult = {
      kind: "resolved",
      targets: [resolvedEntry({ resolution: resolution(true, "semantic") })],
      confidence: "semantic",
      omittedCount: 0,
      nextQueries: [],
    };

    const md = renderResolveResult(result, "/cwd");

    expect(md).toContain("Target ID:");
    expect(md).toContain("Span ID:");
    // Non-obvious resolution surfaces a visible note describing the snap.
    expect(md).toContain("snapped");
    expect(md).toContain("1:1");
    expect(md).toContain("1:17");
  });

  it("does not show a provenance note for an exact name-anchor hit", () => {
    const exact: AnchoredResolutionMetadata = {
      requested: { line: 1, character: 17 },
      resolved: { line: 1, character: 17 },
      snapped: false,
      source: "semantic",
    };
    const result: ResolveServiceResult = {
      kind: "resolved",
      targets: [resolvedEntry({ resolution: exact })],
      confidence: "semantic",
      omittedCount: 0,
      nextQueries: [],
    };

    const md = renderResolveResult(result, "/cwd");

    expect(md).toContain("Target ID:");
    expect(md).not.toContain("snapped");
    expect(md).not.toContain("Snapped");
  });

  it("does not show a resolution note when no resolution metadata is present", () => {
    const result: ResolveServiceResult = {
      kind: "resolved",
      targets: [resolvedEntry()],
      confidence: "semantic",
      omittedCount: 0,
      nextQueries: [],
    };

    const md = renderResolveResult(result, "/cwd");

    expect(md).toContain("Target ID:");
    expect(md).not.toContain("snapped");
    expect(md).not.toContain("Snapped");
  });

  it("notes the evidence source when resolution relied on structural evidence", () => {
    const result: ResolveServiceResult = {
      kind: "resolved",
      targets: [
        resolvedEntry({
          confidence: "structural",
          resolution: resolution(true, "structural-identifier"),
        }),
      ],
      confidence: "structural",
      omittedCount: 0,
      nextQueries: [],
    };

    const md = renderResolveResult(result, "/cwd");

    expect(md).toContain("snapped");
    expect(md).toContain("structural");
  });

  it("renders disambiguation candidates with targetIds", () => {
    const entryBase = resolvedEntry();
    const candidates: DisambiguationCandidate[] = [
      {
        targetId: "tg-a",
        name: "Widget",
        kind: "Class",
        container: null,
        file: "src/a.ts",
        line: 1,
        character: 17,
        reason: "src/a.ts",
        rank: 1,
        anchorKind: "name",
        entry: { ...entryBase, targetId: "tg-a", file: resolve(CWD, "src/a.ts") },
      },
      {
        targetId: "tg-b",
        name: "Widget",
        kind: "Interface",
        container: null,
        file: "src/b.ts",
        line: 1,
        character: 17,
        reason: "src/b.ts",
        rank: 2,
        anchorKind: "name",
        entry: { ...entryBase, targetId: "tg-b", file: resolve(CWD, "src/b.ts") },
      },
    ];
    const result: ResolveServiceResult = {
      kind: "disambiguation",
      candidates,
      omittedCount: 0,
      nextQueries: [],
    };

    const md = renderResolveResult(result, "/cwd");

    expect(md).toContain("Multiple matches");
    expect(md).toContain("tg-a");
    expect(md).toContain("tg-b");
  });
});
