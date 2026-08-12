import { describe, expect, it } from "vitest";
import { normalizeSemanticEdit } from "../../src/provider/semantic-edit-normalizer.ts";

const versions = {
  getOpenDocumentVersion: () => null,
  authorizedMutationRoots: ["/src"],
};

function withOpenVersions(expected: Record<string, number>) {
  return {
    getOpenDocumentVersion: (file: string) => expected[file] ?? null,
    authorizedMutationRoots: ["/src"],
  };
}

describe("normalizeSemanticEdit", () => {
  it("normalizes a changes map in stable URI order", () => {
    const result = normalizeSemanticEdit(
      {
        kind: "workspace-edit",
        edit: {
          changes: {
            "file:///src/z.ts": [
              {
                range: { start: { line: 2, character: 1 }, end: { line: 2, character: 4 } },
                newText: "last",
              },
            ],
            "file:///src/a.ts": [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
                newText: "first",
              },
            ],
          },
        },
      },
      versions,
    );

    expect(result).toEqual({
      kind: "precise",
      authorizedMutationRoots: ["/src"],
      edits: {
        edits: [
          {
            file: "/src/a.ts",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
            newText: "first",
          },
          {
            file: "/src/z.ts",
            range: { start: { line: 2, character: 1 }, end: { line: 2, character: 4 } },
            newText: "last",
          },
        ],
      },
    });
  });

  it("prefers text-only documentChanges and retains validated versions", () => {
    const result = normalizeSemanticEdit(
      {
        kind: "workspace-edit",
        edit: {
          changes: {
            "file:///src/ignored.ts": [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                newText: "ignored",
              },
            ],
          },
          documentChanges: [
            {
              textDocument: { uri: "file:///src/open.ts", version: 4 },
              edits: [
                {
                  range: { start: { line: 3, character: 2 }, end: { line: 3, character: 6 } },
                  newText: "next",
                },
              ],
            },
            {
              textDocument: { uri: "file:///src/disk.ts", version: null },
              edits: [
                {
                  range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                  newText: "import x;\n",
                },
              ],
            },
          ],
        },
      },
      withOpenVersions({ "/src/open.ts": 4 }),
    );

    expect(result).toEqual({
      kind: "precise",
      authorizedMutationRoots: ["/src"],
      edits: {
        edits: [
          {
            file: "/src/open.ts",
            range: { start: { line: 3, character: 2 }, end: { line: 3, character: 6 } },
            newText: "next",
          },
          {
            file: "/src/disk.ts",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            newText: "import x;\n",
          },
        ],
        documentPreconditions: [
          { file: "/src/open.ts", kind: "open-document-version", version: 4 },
          { file: "/src/disk.ts", kind: "disk-content" },
        ],
      },
    });
  });
});
