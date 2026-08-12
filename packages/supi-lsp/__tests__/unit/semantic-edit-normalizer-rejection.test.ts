import { describe, expect, it } from "vitest";
import { normalizeSemanticEdit } from "../../src/provider/semantic-edit-normalizer.ts";

const versions = { getOpenDocumentVersion: () => null };
const fallbackChanges = {
  "file:///src/fallback.ts": [
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      newText: "fallback",
    },
  ],
};

function expectUnavailable(result: ReturnType<typeof normalizeSemanticEdit>, text: string): void {
  expect(result.kind).toBe("unavailable");
  if (result.kind === "unavailable") expect(result.reason.toLowerCase()).toContain(text);
}

describe("normalizeSemanticEdit rejection", () => {
  it.each([
    { kind: "create", uri: "file:///src/new.ts" },
    { kind: "rename", oldUri: "file:///src/a.ts", newUri: "file:///src/b.ts" },
    { kind: "delete", uri: "file:///src/old.ts" },
  ])("rejects a complete response that contains the $kind resource operation", (operation) => {
    const result = normalizeSemanticEdit(
      {
        kind: "workspace-edit",
        edit: {
          changes: fallbackChanges,
          documentChanges: [
            operation,
            {
              textDocument: { uri: "file:///src/a.ts", version: null },
              edits: [
                {
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                  newText: "kept only by unsafe subset handling",
                },
              ],
            },
          ],
        },
      },
      versions,
    );

    expectUnavailable(result, "resource operation");
  });

  it.each([
    { changes: { "untitled:buffer": fallbackChanges["file:///src/fallback.ts"] } },
    {
      documentChanges: [
        {
          textDocument: { uri: "git:/src/a.ts", version: null },
          edits: fallbackChanges["file:///src/fallback.ts"],
        },
      ],
    },
  ])("rejects non-file document URIs", (edit) => {
    const result = normalizeSemanticEdit({ kind: "workspace-edit", edit }, versions);

    expectUnavailable(result, "file uri");
  });

  it("rejects snippet text edits", () => {
    const result = normalizeSemanticEdit(
      {
        kind: "workspace-edit",
        edit: {
          documentChanges: [
            {
              textDocument: { uri: "file:///src/a.ts", version: null },
              edits: [
                {
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                  snippet: { kind: "snippet", value: "const $" + "{1:name} = 1;" },
                },
              ],
            },
          ],
        },
      },
      versions,
    );

    expectUnavailable(result, "snippet");
  });

  it.each([
    {
      name: "annotated text edit",
      edit: {
        documentChanges: [
          {
            textDocument: { uri: "file:///src/a.ts", version: null },
            edits: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                newText: "x",
                annotationId: "change-1",
              },
            ],
          },
        ],
      },
    },
    {
      name: "workspace change annotations",
      edit: {
        changes: fallbackChanges,
        changeAnnotations: { "change-1": { label: "Apply change" } },
      },
    },
    {
      name: "confirmation-dependent annotation",
      edit: {
        documentChanges: [
          {
            textDocument: { uri: "file:///src/a.ts", version: null },
            edits: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                newText: "x",
                annotationId: "change-1",
              },
            ],
          },
        ],
        changeAnnotations: {
          "change-1": { label: "Confirm change", needsConfirmation: true },
        },
      },
    },
  ])("rejects unsupported annotations: $name", ({ edit }) => {
    const result = normalizeSemanticEdit({ kind: "workspace-edit", edit }, versions);

    expectUnavailable(result, "annotation");
  });

  it.each([
    {
      name: "untracked integer version",
      version: 3,
      getOpenDocumentVersion: () => null,
      reason: "cannot be established",
    },
    {
      name: "mismatched open version",
      version: 3,
      getOpenDocumentVersion: () => 4,
      reason: "does not match",
    },
    {
      name: "disk precondition for an open document",
      version: null,
      getOpenDocumentVersion: () => 4,
      reason: "document is open",
    },
  ])("rejects a document version that cannot be validated: $name", (testCase) => {
    const result = normalizeSemanticEdit(
      {
        kind: "workspace-edit",
        edit: {
          documentChanges: [
            {
              textDocument: { uri: "file:///src/a.ts", version: testCase.version },
              edits: fallbackChanges["file:///src/fallback.ts"],
            },
          ],
        },
      },
      { getOpenDocumentVersion: testCase.getOpenDocumentVersion },
    );

    expectUnavailable(result, testCase.reason);
  });

  it("distinguishes an absent workspace edit from a malformed edit", () => {
    const result = normalizeSemanticEdit({ kind: "workspace-edit", edit: null }, versions);

    expectUnavailable(result, "no edit");
  });

  it.each([
    { name: "missing edit collections", edit: {} },
    {
      name: "unknown workspace edit member",
      edit: { changes: fallbackChanges, unsupportedOperation: true },
    },
    { name: "null documentChanges", edit: { documentChanges: null } },
    { name: "non-map changes", edit: { changes: [] } },
    { name: "empty changes", edit: { changes: {} } },
    { name: "empty documentChanges", edit: { documentChanges: [] } },
    {
      name: "malformed document change mixed with a valid change",
      edit: {
        documentChanges: [
          { textDocument: { uri: "file:///src/a.ts", version: null } },
          {
            textDocument: { uri: "file:///src/b.ts", version: null },
            edits: fallbackChanges["file:///src/fallback.ts"],
          },
        ],
      },
    },
    {
      name: "missing document version",
      edit: {
        documentChanges: [
          {
            textDocument: { uri: "file:///src/a.ts" },
            edits: fallbackChanges["file:///src/fallback.ts"],
          },
        ],
      },
    },
    {
      name: "non-integer document version",
      edit: {
        documentChanges: [
          {
            textDocument: { uri: "file:///src/a.ts", version: 1.5 },
            edits: fallbackChanges["file:///src/fallback.ts"],
          },
        ],
      },
    },
    {
      name: "unknown text edit member",
      edit: {
        changes: {
          "file:///src/a.ts": [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              newText: "x",
              insertTextFormat: 2,
            },
          ],
        },
      },
    },
    {
      name: "negative text position",
      edit: {
        changes: {
          "file:///src/a.ts": [
            {
              range: { start: { line: -1, character: 0 }, end: { line: 0, character: 0 } },
              newText: "x",
            },
          ],
        },
      },
    },
    {
      name: "reversed text range",
      edit: {
        changes: {
          "file:///src/a.ts": [
            {
              range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } },
              newText: "x",
            },
          ],
        },
      },
    },
  ])("keeps malformed or empty responses unavailable: $name", ({ edit }) => {
    const result = normalizeSemanticEdit({ kind: "workspace-edit", edit }, versions);

    expect(result.kind).toBe("unavailable");
  });
});
