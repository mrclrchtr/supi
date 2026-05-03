import { afterEach, beforeEach, describe, expect, it } from "vitest";
import gitEditor from "../src/git-editor.ts";

function createPiMock() {
  return { on: () => {} };
}

describe("gitEditor extension", () => {
  let originalGitEditor: string | undefined;
  let originalSequenceEditor: string | undefined;

  beforeEach(() => {
    originalGitEditor = process.env.GIT_EDITOR;
    originalSequenceEditor = process.env.GIT_SEQUENCE_EDITOR;
    delete process.env.GIT_EDITOR;
    delete process.env.GIT_SEQUENCE_EDITOR;
  });

  afterEach(() => {
    if (originalGitEditor === undefined) {
      delete process.env.GIT_EDITOR;
    } else {
      process.env.GIT_EDITOR = originalGitEditor;
    }
    if (originalSequenceEditor === undefined) {
      delete process.env.GIT_SEQUENCE_EDITOR;
    } else {
      process.env.GIT_SEQUENCE_EDITOR = originalSequenceEditor;
    }
  });

  it("sets GIT_EDITOR to true", () => {
    const pi = createPiMock();
    gitEditor(pi as unknown as Parameters<typeof gitEditor>[0]);
    expect(process.env.GIT_EDITOR).toBe("true");
  });

  it("sets GIT_SEQUENCE_EDITOR to true", () => {
    const pi = createPiMock();
    gitEditor(pi as unknown as Parameters<typeof gitEditor>[0]);
    expect(process.env.GIT_SEQUENCE_EDITOR).toBe("true");
  });
});
