import { describe, expect, it } from "vitest";
import type { ServerCapabilities } from "vscode-languageserver-protocol";
import { CodeActionKind } from "vscode-languageserver-types";
import {
  codeActionKindsForOperation,
  getServerOperationSupport,
  isCodeActionKindInRange,
  supportsRequestedCodeActionKinds,
} from "../../src/config/operation-support.ts";

function capabilities(codeActionKinds: string[]): ServerCapabilities {
  return { codeActionProvider: { codeActionKinds } };
}

describe("code-action operation support", () => {
  it("keeps a generic parent eligible but reports exact health as unknown", () => {
    const value = capabilities(["refactor"]);

    expect(supportsRequestedCodeActionKinds(value, ["refactor.extract.function"])).toBe(true);
    expect(getServerOperationSupport(value).extract_function?.server).toBe("unknown");
  });

  it("reports an explicitly advertised child as exact health", () => {
    const value = capabilities(["refactor.extract.function"]);

    expect(supportsRequestedCodeActionKinds(value, ["refactor.extract.function"])).toBe(true);
    expect(getServerOperationSupport(value).extract_function?.server).toBe("advertised");
  });

  it("rejects unrelated advertised kinds", () => {
    const value = capabilities(["quickfix"]);

    expect(supportsRequestedCodeActionKinds(value, ["refactor.extract.function"])).toBe(false);
    expect(getServerOperationSupport(value).extract_function?.server).toBe("not-advertised");
  });

  it("accepts native unused-import kinds without treating them as general removal", () => {
    const value = capabilities(["source.removeUnusedImports"]);

    expect(supportsRequestedCodeActionKinds(value, ["source.removeUnused"])).toBe(false);
    expect(
      supportsRequestedCodeActionKinds(value, codeActionKindsForOperation("delete_dead_code")),
    ).toBe(true);
    expect(getServerOperationSupport(value).delete_dead_code).toEqual({
      server: "advertised",
      supi: "limited",
      reason:
        "Only unused-import removal is supported by this mapping, not arbitrary unused declarations.",
    });
  });

  it.each([["source.removeUnused"], ["source.removeUnused.ts", "source.removeUnusedImports.ts"]])(
    "preserves general unused-code support for %j",
    (...kinds) => {
      expect(getServerOperationSupport(capabilities(kinds)).delete_dead_code).toEqual({
        server: "advertised",
        supi: "supported",
      });
    },
  );

  it.each(["quickfix", "source.fixAll", "source.removeUnusedImportsExtra"])(
    "does not advertise dead-code removal for %s",
    (kind) => {
      const value = capabilities([kind]);
      expect(
        supportsRequestedCodeActionKinds(value, codeActionKindsForOperation("delete_dead_code")),
      ).toBe(false);
      expect(getServerOperationSupport(value).delete_dead_code?.server).toBe("not-advertised");
    },
  );

  it("treats CodeActionKind.Empty as a generic advertisement", () => {
    const value = capabilities([CodeActionKind.Empty]);

    expect(isCodeActionKindInRange(CodeActionKind.Empty, "source.organizeImports")).toBe(true);
    expect(supportsRequestedCodeActionKinds(value, ["source.organizeImports"])).toBe(true);
    expect(getServerOperationSupport(value).update_imports?.server).toBe("unknown");
  });
});
