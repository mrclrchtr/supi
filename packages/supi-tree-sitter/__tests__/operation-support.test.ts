import { describe, expect, it } from "vitest";
import { getStructuralSearchSupportedExtensions, getSupportedExtensions } from "../src/api.ts";
import { detectGrammar } from "../src/language.ts";

const JS_TS_GRAMMARS = new Set(["javascript", "typescript", "tsx"]);
const CALL_UNSUPPORTED_EXTENSIONS = new Set([".html", ".htm", ".xhtml", ".sql"]);

function extensionsForGrammars(grammars: ReadonlySet<string>): string[] {
  return getSupportedExtensions().filter((extension) =>
    grammars.has(detectGrammar(`file${extension}`) ?? ""),
  );
}

describe("structural search operation support", () => {
  it("declares every parser extension eligible for outlines", () => {
    expect(getStructuralSearchSupportedExtensions("outline")).toEqual(getSupportedExtensions());
  });

  it.each(["imports", "exports"] as const)(
    "declares only JavaScript and TypeScript extensions for %s",
    (operation) => {
      expect(getStructuralSearchSupportedExtensions(operation)).toEqual(
        extensionsForGrammars(JS_TS_GRAMMARS),
      );
    },
  );

  it("derives call-site extensions from the extractor query registry", () => {
    expect(getStructuralSearchSupportedExtensions("call-sites")).toEqual(
      getSupportedExtensions().filter((extension) => !CALL_UNSUPPORTED_EXTENSIONS.has(extension)),
    );
  });

  it("rejects unknown operations instead of defaulting to another extractor", () => {
    expect(() => getStructuralSearchSupportedExtensions("definitions" as never)).toThrow(
      "Unsupported structural search operation: definitions",
    );
  });
});
