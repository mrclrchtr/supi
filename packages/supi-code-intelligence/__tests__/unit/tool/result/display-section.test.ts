import { describe, expect, it } from "vitest";
import {
  createEvidenceList,
  createPartialEvidenceList,
} from "../../../../src/analysis/evidence.ts";
import {
  createToolDisplaySection,
  formatDisplaySectionBounds,
  MAX_TUI_DISPLAY_ITEMS,
  readToolDisplaySections,
} from "../../../../src/tool/result/display.ts";

const rows = (count: number) => Array.from({ length: count }, (_, index) => `row ${index + 1}`);

describe("TUI display sections", () => {
  it("reports view-hidden rows as Display omissions without changing evidence counts", () => {
    const evidence = createEvidenceList({ key: "k", items: rows(30), maxResults: 25 });

    const section = createToolDisplaySection({
      title: "Rows",
      items: evidence.items,
      evidence: evidence.metadata,
      format: (row) => row,
    });

    expect(section.lines).toHaveLength(MAX_TUI_DISPLAY_ITEMS);
    expect(section.evidence).toMatchObject({
      completeness: "capped",
      totalCount: 30,
      shownCount: 25,
      omittedCount: 5,
    });
    expect(section.displayOmittedCount).toBe(5);
    expect(formatDisplaySectionBounds(section)).toBe(
      " (25 of 30; 5 omitted; 5 rows hidden in view)",
    );
  });

  it("keeps an unbounded list unbounded when the view also hides rows", () => {
    const evidence = createPartialEvidenceList({
      key: "k",
      items: rows(25),
      collectedCount: null,
      partialReason: "safety-limit",
      partialMessage: "Collection stopped at its entry limit.",
    });

    const section = createToolDisplaySection({
      title: "Rows",
      items: evidence.items,
      evidence: evidence.metadata,
      format: (row) => row,
    });

    expect(section.evidence).toMatchObject({ completeness: "unbounded", omittedCount: null });
    expect(formatDisplaySectionBounds(section)).toBe(
      " (25; more may exist — safety-limit; Collection stopped at its entry limit.; 5 rows hidden in view)",
    );
  });

  it("round-trips through persisted details", () => {
    const evidence = createEvidenceList({ key: "k", items: rows(2) });
    const section = createToolDisplaySection({
      title: "Rows",
      items: evidence.items,
      evidence: evidence.metadata,
      format: (row) => row,
    });

    expect(readToolDisplaySections(JSON.parse(JSON.stringify([section])))).toEqual([section]);
    expect(formatDisplaySectionBounds(section)).toBe(" (2)");
  });

  it("drops persisted sections whose evidence lacks a completeness state", () => {
    const evidence = createEvidenceList({ key: "k", items: rows(1) });
    const section = createToolDisplaySection({
      title: "Rows",
      items: evidence.items,
      evidence: evidence.metadata,
      format: (row) => row,
    });
    const { completeness: _dropped, ...legacy } = section.evidence;

    expect(readToolDisplaySections([{ ...section, evidence: legacy }])).toEqual([]);
  });
});
