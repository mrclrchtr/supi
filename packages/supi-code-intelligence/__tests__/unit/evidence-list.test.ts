import { describe, expect, it } from "vitest";
import {
  createEvidenceList,
  createPartialEvidenceList,
  renderEvidenceListDisclosure,
  summarizeEvidenceLists,
} from "../../src/evidence-list.ts";

describe("evidence lists", () => {
  it("discloses exact truncation with shared markdown and metadata", () => {
    const list = createEvidenceList({
      key: "references.locations",
      items: ["a", "b", "c", "d", "e"],
      maxResults: 3,
    });

    expect(list.items).toEqual(["a", "b", "c"]);
    expect(list.metadata).toEqual({
      key: "references.locations",
      totalCount: 5,
      shownCount: 3,
      omittedCount: 2,
      partialReason: null,
    });
    expect(renderEvidenceListDisclosure(list)).toBe("_(showing 3 of 5; 2 omitted)_");
    expect(summarizeEvidenceLists([list])).toEqual({
      omittedCount: 2,
      evidenceLists: [list.metadata],
    });
  });

  it("discloses provider-limited partial results without inventing totals", () => {
    const list = createPartialEvidenceList({
      key: "find.semanticSymbols",
      items: ["A", "B", "C"],
      partialReason: "provider-limited",
    });

    expect(list.items).toEqual(["A", "B", "C"]);
    expect(list.metadata).toEqual({
      key: "find.semanticSymbols",
      totalCount: null,
      shownCount: 3,
      omittedCount: null,
      partialReason: "provider-limited",
    });
    expect(renderEvidenceListDisclosure(list)).toBe(
      "_(showing 3; more may exist — provider-limited)_",
    );
    expect(summarizeEvidenceLists([list])).toEqual({
      omittedCount: 0,
      evidenceLists: [list.metadata],
    });
  });
});
