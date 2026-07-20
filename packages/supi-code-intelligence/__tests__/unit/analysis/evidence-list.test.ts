import { describe, expect, it } from "vitest";
import {
  createEvidenceList,
  createPartialEvidenceList,
  renderEvidenceListDisclosure,
  summarizeEvidenceLists,
} from "../../../src/analysis/evidence.ts";

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

  it("counts collected evidence hidden by a partial-result display cap", () => {
    const list = createPartialEvidenceList({
      key: "find.astMatches",
      items: ["A", "B", "C", "D"],
      maxResults: 2,
      partialReason: "timeout",
    });

    expect(list.items).toEqual(["A", "B"]);
    expect(list.metadata).toEqual({
      key: "find.astMatches",
      totalCount: null,
      shownCount: 2,
      omittedCount: 2,
      partialReason: "timeout",
    });
    expect(renderEvidenceListDisclosure(list)).toBe(
      "_(showing 2; 2 collected omitted; more may exist — timeout)_",
    );
    expect(summarizeEvidenceLists([list]).omittedCount).toBe(2);
  });
});
