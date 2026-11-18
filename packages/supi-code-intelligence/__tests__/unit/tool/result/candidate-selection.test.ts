import { describe, expect, it } from "vitest";
import {
  createEvidenceList,
  createPartialEvidenceList,
} from "../../../../src/analysis/evidence.ts";
import {
  assembleCandidateSelection,
  type CandidateSelectionOutcome,
} from "../../../../src/tool/result/candidate-selection.ts";

const cwd = "/repo";
const candidates = [
  {
    targetId: "t1",
    name: "run",
    kind: "method",
    container: "Job",
    file: "/repo/src/job.ts",
    line: 4,
    character: 3,
    rank: 1,
  },
  {
    targetId: "t2",
    name: "run",
    kind: "function",
    container: null,
    file: "/repo/src/run.ts",
    line: 1,
    character: 17,
    rank: 2,
  },
];
const complete = createEvidenceList({ key: "target.candidates", items: candidates }).metadata;

function outcome(
  overrides: { requestedKind?: string; candidateEvidence?: typeof complete } = {},
): CandidateSelectionOutcome {
  const candidateEvidence = overrides.candidateEvidence ?? complete;
  return overrides.requestedKind
    ? {
        kind: "kind-mismatch",
        requestedKind: overrides.requestedKind,
        candidates,
        candidateEvidence,
      }
    : { kind: "disambiguation", candidates, candidateEvidence };
}

describe("candidate selection", () => {
  it("renders handle-first rows with containers and display paths", () => {
    const selection = assembleCandidateSelection({
      outcome: outcome(),
      key: "graph.candidates",
      cwd,
    });

    expect(selection.content).toBe(
      [
        "# Multiple targets match",
        "",
        "- `t1` — **run** (`method`) in `Job` at `src/job.ts`:4:3",
        "- `t2` — **run** (`function`) at `src/run.ts`:1:17",
        "",
        "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind.",
      ].join("\n"),
    );
    expect(selection.candidates.map((candidate) => candidate.file)).toEqual([
      "src/job.ts",
      "src/run.ts",
    ]);
    expect(selection.evidence.key).toBe("graph.candidates");
    expect(selection.displaySections).toHaveLength(1);
    expect(selection.displaySections[0]).toMatchObject({
      key: "graph.candidates",
      title: "Candidates",
      lines: ["t1 — run (method) at src/job.ts:4:3", "t2 — run (function) at src/run.ts:1:17"],
    });
  });

  it("renders notes about unlisted matches before the recovery sentence", () => {
    const selection = assembleCandidateSelection({
      outcome: {
        kind: "disambiguation",
        candidates,
        candidateEvidence: complete,
        candidateNotes: ["1 partial-name match (`runAll`) is not listed."],
      },
      key: "resolve.candidates",
      cwd,
    });

    expect(selection.content.split("\n").slice(-4)).toEqual([
      "",
      "_Note: 1 partial-name match (`runAll`) is not listed._",
      "",
      "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind.",
    ]);
  });

  it.each([
    [
      "disambiguation",
      outcome(),
      "Multiple target matches require one candidate.",
      "Choose one candidate handle, or narrow the symbol selector with scope or symbolKind",
    ],
    [
      "kind-mismatch",
      outcome({ requestedKind: "class" }),
      "No target matched provider kind class.",
      "Retry without symbolKind, use an observed provider kind, or choose a near-match handle",
    ],
  ])("reports %s as a selection, never invalid input", (_name, input, message, nextQuery) => {
    const selection = assembleCandidateSelection({
      outcome: input,
      key: "resolve.candidates",
      cwd,
    });

    expect(selection.status).toBe("disambiguation");
    expect(selection.message).toBe(message);
    expect(selection.nextQueries).toEqual([nextQuery]);
  });

  it("names near matches for a symbol-kind mismatch", () => {
    const selection = assembleCandidateSelection({
      outcome: outcome({ requestedKind: "class" }),
      key: "resolve.candidates",
      cwd,
    });

    expect(selection.content.split("\n").slice(0, 3)).toEqual([
      "# No target matched provider kind `class`",
      "",
      "Near matches:",
    ]);
    expect(selection.displaySections[0]?.title).toBe("Near matches");
  });

  it("discloses partial candidate evidence with the canonical wording", () => {
    const partial = createPartialEvidenceList({
      key: "target.candidates",
      items: candidates,
      collectedCount: null,
      partialReason: "provider-limited",
      partialMessage: "workspace symbols capped",
    }).metadata;

    const selection = assembleCandidateSelection({
      outcome: outcome({ candidateEvidence: partial }),
      key: "orientation.candidates",
      cwd,
    });

    expect(selection.evidence).toMatchObject({
      key: "orientation.candidates",
      completeness: "unbounded",
    });
    expect(selection.content).toContain(
      "_(showing 2 candidates; more may exist — provider-limited; workspace symbols capped)_",
    );
  });

  it.each([
    ["disambiguation", outcome(), "Use one candidate handle as focus.target.handle"],
    [
      "kind-mismatch",
      outcome({ requestedKind: "class" }),
      "Retry without symbolKind, use an observed provider kind, or focus one handle",
    ],
  ])("uses a tool's %s recovery wording in markdown and next queries", (_name, input, recovery) => {
    const selection = assembleCandidateSelection({
      outcome: input,
      key: "orientation.candidates",
      cwd,
      recovery,
    });

    expect(selection.nextQueries).toEqual([recovery]);
    expect(selection.content.endsWith(`${recovery}.`)).toBe(true);
  });
});
