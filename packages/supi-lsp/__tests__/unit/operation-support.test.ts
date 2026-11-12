import { describe, expect, it } from "vitest";
import type { ServerCapabilities } from "vscode-languageserver-protocol";
import { CodeActionKind } from "vscode-languageserver-types";
import {
  getServerOperationSupport,
  isCodeActionKindInRange,
  supportsRequestedCodeActionKinds,
} from "../../src/config/operation-support.ts";

function capabilities(codeActionKinds: string[]): ServerCapabilities {
  return { codeActionProvider: { codeActionKinds } };
}

describe("code-action operation support", () => {
  it("keeps a generic parent eligible for a specific requested kind", () => {
    expect(
      supportsRequestedCodeActionKinds(capabilities(["refactor"]), ["refactor.extract.function"]),
    ).toBe(true);
  });

  it("rejects unrelated advertised kinds", () => {
    expect(
      supportsRequestedCodeActionKinds(capabilities(["quickfix"]), ["refactor.extract.function"]),
    ).toBe(false);
  });

  it("treats CodeActionKind.Empty as a generic advertisement", () => {
    expect(isCodeActionKindInRange(CodeActionKind.Empty, "source.organizeImports")).toBe(true);
    expect(
      supportsRequestedCodeActionKinds(capabilities([CodeActionKind.Empty]), [
        "source.organizeImports",
      ]),
    ).toBe(true);
  });

  it("splits advertised kinds between code_action and source_action", () => {
    // jdtls 1.63 advertisement.
    const support = getServerOperationSupport(
      capabilities([
        "quickfix",
        "refactor",
        "refactor.extract",
        "refactor.inline",
        "source",
        "source.organizeImports",
      ]),
    );

    expect(support.code_action).toEqual({
      server: "advertised",
      supi: "supported",
      kinds: ["refactor", "refactor.extract", "refactor.inline"],
    });
    expect(support.source_action).toEqual({
      server: "advertised",
      supi: "supported",
      kinds: ["source", "source.organizeImports"],
    });
  });

  it("reports an unnarrowed code-action provider as offering any kind", () => {
    const support = getServerOperationSupport({ codeActionProvider: true });

    expect(support.code_action).toEqual({ server: "advertised", supi: "supported", anyKind: true });
    expect(support.source_action).toEqual({
      server: "advertised",
      supi: "supported",
      anyKind: true,
    });
  });

  it("keeps listed kinds alongside CodeActionKind.Empty", () => {
    // rust-analyzer advertisement.
    const support = getServerOperationSupport(
      capabilities(["", "quickfix", "refactor", "refactor.extract", "refactor.rewrite"]),
    );

    expect(support.code_action).toEqual({
      server: "advertised",
      supi: "supported",
      kinds: ["refactor", "refactor.extract", "refactor.rewrite"],
      anyKind: true,
    });
    expect(support.source_action).toEqual({
      server: "advertised",
      supi: "supported",
      anyKind: true,
    });
  });

  it("reports missing families as not advertised", () => {
    // TypeScript native advertises source actions only.
    const support = getServerOperationSupport(
      capabilities(["source.organizeImports", "source.removeUnusedImports"]),
    );

    expect(support.code_action).toEqual({ server: "not-advertised", supi: "supported" });
    expect(support.source_action?.kinds).toEqual([
      "source.organizeImports",
      "source.removeUnusedImports",
    ]);
  });
});
