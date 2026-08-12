import { describe, expect, it } from "vitest";
import { normalizeSemanticEdit } from "../../src/provider/semantic-edit-normalizer.ts";

const versions = {
  getOpenDocumentVersion: () => null,
  authorizedMutationRoots: ["/src"],
};
const edit = {
  changes: {
    "file:///src/a.ts": [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        newText: "next",
      },
    ],
  },
};

describe("semantic code action normalization", () => {
  it("normalizes a complete edit-only code action", () => {
    const result = normalizeSemanticEdit(
      { kind: "code-action", action: { title: "Extract function", edit } },
      versions,
    );

    expect(result).toMatchObject({
      kind: "precise",
      authorizedMutationRoots: ["/src"],
      edits: { edits: [{ file: "/src/a.ts", newText: "next" }] },
    });
  });

  it("rejects a code action that also requires a command", () => {
    const result = normalizeSemanticEdit(
      {
        kind: "code-action",
        action: {
          title: "Extract function",
          edit,
          command: { title: "Finish extract", command: "server.finishExtract" },
        },
      },
      versions,
    );

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") expect(result.reason.toLowerCase()).toContain("command");
  });

  it.each([
    {
      name: "command-only action",
      action: { title: "Run refactor", command: { title: "Run", command: "server.run" } },
      reason: "command",
    },
    {
      name: "disabled action",
      action: { title: "Extract function", disabled: { reason: "Selection is invalid" }, edit },
      reason: "disabled",
    },
    { name: "edit-less action", action: { title: "Extract function" }, reason: "no edit" },
    { name: "malformed action", action: "extract", reason: "malformed" },
    { name: "missing title", action: { edit }, reason: "malformed" },
    {
      name: "unknown action member",
      action: { title: "Extract function", edit, unsupportedStep: true },
      reason: "malformed",
    },
    {
      name: "unsupported protocol member",
      action: { title: "Extract function", edit, tags: [1] },
      reason: "malformed",
    },
  ])("rejects an incomplete code action: $name", ({ action, reason }) => {
    const result = normalizeSemanticEdit({ kind: "code-action", action }, versions);

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") expect(result.reason.toLowerCase()).toContain(reason);
  });
});
