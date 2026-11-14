import { describe, expect, it } from "vitest";
import {
  createBoundedEvidenceList,
  createEvidenceList,
  createPartialEvidenceList,
  describeEvidenceList,
  type EvidenceList,
  type EvidenceListFacts,
  knownEvidenceCount,
  markEvidencePartial,
  readEvidenceListFacts,
  rekeyEvidence,
  renderEvidenceListDisclosure,
  toEvidenceListFacts,
} from "../../../src/analysis/evidence.ts";

describe("Evidence list module", () => {
  it.each<{
    name: string;
    build: () => EvidenceList<unknown>;
    items: unknown[];
    metadata: EvidenceListFacts;
    phrase: string;
    disclosure: string | null;
  }>([
    {
      name: "complete when every collected atom is shown",
      build: () => createEvidenceList({ key: "k", items: ["a", "b"] }),
      items: ["a", "b"],
      metadata: {
        key: "k",
        completeness: "complete",
        totalCount: 2,
        shownCount: 2,
        omittedCount: 0,
        partialReason: null,
      },
      phrase: "2",
      disclosure: null,
    },
    {
      name: "capped when a Result cap hides atoms of an exact total",
      build: () =>
        createEvidenceList({ key: "k", items: ["a", "b", "c", "d", "e"], maxResults: 3 }),
      items: ["a", "b", "c"],
      metadata: {
        key: "k",
        completeness: "capped",
        totalCount: 5,
        shownCount: 3,
        omittedCount: 2,
        partialReason: null,
      },
      phrase: "3 of 5; 2 omitted",
      disclosure: "_(showing 3 of 5; 2 omitted)_",
    },
    {
      name: "capped from a provider-counted total over pre-bounded items",
      build: () => createBoundedEvidenceList({ key: "k", items: ["a"], totalCount: 4 }),
      items: ["a"],
      metadata: {
        key: "k",
        completeness: "capped",
        totalCount: 4,
        shownCount: 1,
        omittedCount: 3,
        partialReason: null,
      },
      phrase: "1 of 4; 3 omitted",
      disclosure: "_(showing 1 of 4; 3 omitted)_",
    },
    {
      name: "partial with no hidden collected atoms",
      build: () =>
        createPartialEvidenceList({
          key: "k",
          items: ["A", "B", "C"],
          partialReason: "provider-limited",
        }),
      items: ["A", "B", "C"],
      metadata: {
        key: "k",
        completeness: "partial",
        totalCount: null,
        shownCount: 3,
        omittedCount: 0,
        partialReason: "provider-limited",
      },
      phrase: "3; more may exist — provider-limited",
      disclosure: "_(showing 3; more may exist — provider-limited)_",
    },
    {
      name: "partial counting collected atoms hidden by a cap",
      build: () =>
        createPartialEvidenceList({
          key: "k",
          items: ["A", "B", "C", "D"],
          maxResults: 2,
          partialReason: "timeout",
        }),
      items: ["A", "B"],
      metadata: {
        key: "k",
        completeness: "partial",
        totalCount: null,
        shownCount: 2,
        omittedCount: 2,
        partialReason: "timeout",
      },
      phrase: "2; 2 collected omitted; more may exist — timeout",
      disclosure: "_(showing 2; 2 collected omitted; more may exist — timeout)_",
    },
    {
      name: "partial from pre-bounded items with a known collected count",
      build: () =>
        createPartialEvidenceList({
          key: "k",
          items: ["A"],
          collectedCount: 3,
          partialReason: "provider-limited",
          partialMessage: "server still indexing",
        }),
      items: ["A"],
      metadata: {
        key: "k",
        completeness: "partial",
        totalCount: null,
        shownCount: 1,
        omittedCount: 2,
        partialReason: "provider-limited",
        partialMessage: "server still indexing",
      },
      phrase: "1; 2 collected omitted; more may exist — provider-limited; server still indexing",
      disclosure:
        "_(showing 1; 2 collected omitted; more may exist — provider-limited; server still indexing)_",
    },
    {
      name: "unbounded when hidden collected atoms were not counted",
      build: () =>
        createPartialEvidenceList({
          key: "k",
          items: ["A"],
          collectedCount: null,
          partialReason: "interrupted",
        }),
      items: ["A"],
      metadata: {
        key: "k",
        completeness: "unbounded",
        totalCount: null,
        shownCount: 1,
        omittedCount: null,
        partialReason: "interrupted",
      },
      phrase: "1; more may exist — interrupted",
      disclosure: "_(showing 1; more may exist — interrupted)_",
    },
    {
      name: "partial with an exact valid total when provider locations were invalid",
      build: () =>
        createEvidenceList({
          key: "k",
          items: ["a", "b", "c"],
          maxResults: 2,
          invalidLocationCount: 1,
        }),
      items: ["a", "b"],
      metadata: {
        key: "k",
        completeness: "partial",
        totalCount: 3,
        shownCount: 2,
        omittedCount: 1,
        partialReason: "invalid-provider-location",
        invalidLocationCount: 1,
      },
      phrase: "2 of 3; 1 omitted; 1 invalid provider location omitted (invalid-provider-location)",
      disclosure:
        "_(showing 2 of 3; 1 omitted; 1 invalid provider location omitted (invalid-provider-location))_",
    },
    {
      name: "partial when provider-limited collection also excluded invalid locations",
      build: () =>
        createPartialEvidenceList({
          key: "k",
          items: ["a", "b", "c"],
          maxResults: 2,
          partialReason: "provider-limited",
          invalidLocationCount: 1,
        }),
      items: ["a", "b"],
      metadata: {
        key: "k",
        completeness: "partial",
        totalCount: null,
        shownCount: 2,
        omittedCount: 1,
        partialReason: "provider-limited",
        invalidLocationCount: 1,
      },
      phrase:
        "2; 1 collected omitted; more may exist — provider-limited; 1 invalid provider location omitted (invalid-provider-location)",
      disclosure:
        "_(showing 2; 1 collected omitted; more may exist — provider-limited; 1 invalid provider location omitted (invalid-provider-location))_",
    },
  ])("is $name", ({ build, items, metadata, phrase, disclosure }) => {
    const list = build();

    expect(list.items).toEqual(items);
    expect(list.metadata).toEqual(metadata);
    // Every constructed list must survive persistence and be read back unchanged.
    expect(readEvidenceListFacts(JSON.parse(JSON.stringify(list.metadata)))).toEqual(metadata);
    expect(describeEvidenceList(list.metadata)).toBe(phrase);
    expect(renderEvidenceListDisclosure(list)).toBe(disclosure);
  });

  it("names the counted atoms in the canonical phrase", () => {
    const capped = createEvidenceList({ key: "k", items: [1, 2, 3], maxResults: 1 }).metadata;
    const complete = createEvidenceList({ key: "k", items: [1] }).metadata;

    expect(describeEvidenceList(capped, "references")).toBe("1 of 3 references; 2 omitted");
    expect(describeEvidenceList(complete, "references")).toBe("1 references");
  });

  it("counts known atoms without claiming completeness", () => {
    const partial = createPartialEvidenceList({
      key: "k",
      items: [1],
      collectedCount: 3,
      partialReason: "timeout",
    }).metadata;
    const unbounded = createPartialEvidenceList({
      key: "k",
      items: [1],
      collectedCount: null,
      partialReason: "timeout",
    }).metadata;
    const capped = createBoundedEvidenceList({ key: "k", items: [1], totalCount: 9 }).metadata;

    expect([partial, unbounded, capped].map(knownEvidenceCount)).toEqual([3, 1, 9]);
  });

  it("sorts before capping so the shown atoms follow Evidence ordering", () => {
    const list = createEvidenceList({
      key: "k",
      items: [3, 1, 2],
      maxResults: 2,
      sort: (a, b) => a - b,
    });

    expect(list.items).toEqual([1, 2]);
  });

  it.each([
    [
      "shown above an exact total",
      () => createBoundedEvidenceList({ key: "k", items: [1, 2], totalCount: 1 }),
    ],
    ["a negative total", () => createBoundedEvidenceList({ key: "k", items: [], totalCount: -1 })],
    [
      "shown above the collected count",
      () =>
        createPartialEvidenceList({
          key: "k",
          items: [1, 2],
          collectedCount: 1,
          partialReason: "timeout",
        }),
    ],
    ["a negative cap", () => createEvidenceList({ key: "k", items: [1], maxResults: -1 })],
    [
      "a negative invalid location count",
      () => createEvidenceList({ key: "k", items: [1], invalidLocationCount: -1 }),
    ],
  ])("rejects %s as a programmer error", (_name, build) => {
    expect(build).toThrow(/evidence list/i);
  });

  it("marks an interrupted collection partial while keeping its counted omissions", () => {
    const capped = createEvidenceList({ key: "k", items: [1, 2, 3], maxResults: 1 }).metadata;

    expect(markEvidencePartial(capped, "safety-limit")).toEqual({
      key: "k",
      completeness: "partial",
      totalCount: null,
      shownCount: 1,
      omittedCount: 2,
      partialReason: "safety-limit",
    });
    const invalid = createEvidenceList({ key: "k", items: [1], invalidLocationCount: 1 }).metadata;
    expect(() => markEvidencePartial(invalid, "timeout")).toThrow(/evidence list/i);
  });

  it("re-keys metadata without changing its counts or state", () => {
    const list = createBoundedEvidenceList({ key: "target.candidates", items: [1], totalCount: 2 });

    expect(rekeyEvidence(list.metadata, "graph.candidates")).toEqual({
      ...list.metadata,
      key: "graph.candidates",
    });
  });

  it("reads persisted facts back and rejects metadata without a consistent state", () => {
    const capped = createEvidenceList({ key: "k", items: [1, 2, 3], maxResults: 1 }).metadata;
    const persisted = JSON.parse(JSON.stringify(toEvidenceListFacts(capped)));

    expect(readEvidenceListFacts(persisted)).toEqual(toEvidenceListFacts(capped));
    expect(readEvidenceListFacts({ ...persisted, completeness: undefined })).toBeNull();
    expect(readEvidenceListFacts({ ...persisted, completeness: "complete" })).toBeNull();
    expect(readEvidenceListFacts({ ...persisted, omittedCount: 5 })).toBeNull();
  });

  it.each([
    [
      "a complete list without a total",
      {
        completeness: "complete",
        totalCount: null,
        shownCount: 1,
        omittedCount: 0,
        partialReason: null,
      },
    ],
    [
      "a capped list without a total",
      {
        completeness: "capped",
        totalCount: null,
        shownCount: 1,
        omittedCount: 2,
        partialReason: null,
      },
    ],
    [
      "an incomplete collection claiming an exact total",
      {
        completeness: "partial",
        totalCount: 3,
        shownCount: 1,
        omittedCount: 2,
        partialReason: "timeout",
      },
    ],
    [
      "invalid locations without their reason",
      {
        completeness: "complete",
        totalCount: 1,
        shownCount: 1,
        omittedCount: 0,
        partialReason: null,
        invalidLocationCount: 2,
      },
    ],
    [
      "an invalid-location reason without a count",
      {
        completeness: "partial",
        totalCount: 1,
        shownCount: 1,
        omittedCount: 0,
        partialReason: "invalid-provider-location",
      },
    ],
  ])("rejects persisted facts for %s", (_name, facts) => {
    expect(readEvidenceListFacts({ key: "k", ...facts })).toBeNull();
  });
});
