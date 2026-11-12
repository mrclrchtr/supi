import { describe, expect, it } from "vitest";
import { collectCodeActionResults } from "../../src/provider/refactor-planning.ts";

describe("collectCodeActionResults", () => {
  it('keeps the "has no edit" vs "could not produce precise edits" distinction', () => {
    const results = collectCodeActionResults(
      [
        { title: "Organize Imports" } as Parameters<typeof collectCodeActionResults>[0][number],
        {
          title: "Rewrite",
          edit: { changes: {} },
        } as Parameters<typeof collectCodeActionResults>[0][number],
      ],
      {
        getOpenDocumentVersion: () => null,
        authorizedMutationRoots: ["/src"],
      },
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      kind: "unavailable",
      reason: 'Code action "Organize Imports" has no edit',
    });
    expect(results[1]).toEqual({
      kind: "unavailable",
      reason:
        'Code action "Rewrite" could not produce precise edits: Workspace edit contains no file edits.',
    });
  });
});
