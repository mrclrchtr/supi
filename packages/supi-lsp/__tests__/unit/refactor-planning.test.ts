import { describe, expect, it } from "vitest";
import {
  collectCodeActionResults,
  isDeleteDeadCodeCodeAction,
  isUpdateImportsCodeAction,
} from "../../src/provider/refactor-planning.ts";

function makeDeleteDeadCodeAction(
  title: string,
  kind?: string,
): Parameters<typeof isDeleteDeadCodeCodeAction>[0] {
  return { title, kind } as Parameters<typeof isDeleteDeadCodeCodeAction>[0];
}

function makeUpdateImportsAction(
  title: string,
  kind?: string,
): Parameters<typeof isUpdateImportsCodeAction>[0] {
  return { title, kind } as Parameters<typeof isUpdateImportsCodeAction>[0];
}

describe("isUpdateImportsCodeAction", () => {
  it("requires the documented kind and never guesses from a title", () => {
    expect(isUpdateImportsCodeAction(makeUpdateImportsAction("Organize Imports"))).toBe(false);
    expect(isUpdateImportsCodeAction(makeUpdateImportsAction("Organize Imports", "quickfix"))).toBe(
      false,
    );
  });

  it("matches explicit organize-imports kinds", () => {
    expect(
      isUpdateImportsCodeAction(makeUpdateImportsAction("Sort imports", "source.organizeImports")),
    ).toBe(true);
    expect(
      isUpdateImportsCodeAction(
        makeUpdateImportsAction("Sort imports", "source.organizeImports.project"),
      ),
    ).toBe(true);
  });
});

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

describe("isDeleteDeadCodeCodeAction", () => {
  it("requires the documented source.removeUnused kind", () => {
    expect(
      isDeleteDeadCodeCodeAction(
        makeDeleteDeadCodeAction("Remove unused declaration", "source.removeUnused"),
      ),
    ).toBe(true);
    expect(
      isDeleteDeadCodeCodeAction(makeDeleteDeadCodeAction("Remove unused declaration", "quickfix")),
    ).toBe(false);
  });

  it("rejects title-only and unrelated kinds", () => {
    expect(
      isDeleteDeadCodeCodeAction(makeDeleteDeadCodeAction("Move declaration to new file")),
    ).toBe(false);
    expect(
      isDeleteDeadCodeCodeAction(
        makeDeleteDeadCodeAction("Remove unused declaration", "refactor.rewrite"),
      ),
    ).toBe(false);
  });

  it("rejects dead-code-looking titles when the kind is unsupported", () => {
    expect(
      isDeleteDeadCodeCodeAction(
        makeDeleteDeadCodeAction("Remove unused declaration", "source.organizeImports"),
      ),
    ).toBe(false);
  });

  it("rejects source.fixAll actions even when the title looks like dead-code removal", () => {
    expect(
      isDeleteDeadCodeCodeAction(
        makeDeleteDeadCodeAction("Remove unused declaration", "source.fixAll"),
      ),
    ).toBe(false);
    expect(isDeleteDeadCodeCodeAction(makeDeleteDeadCodeAction("Fix all", "source.fixAll"))).toBe(
      false,
    );
  });
});
