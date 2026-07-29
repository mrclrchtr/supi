import { describe, expect, it } from "vitest";
import { getStructuralSearchSupportedExtensions, getSupportedExtensions } from "../src/api.ts";

const JS_TS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx"];
const OUTLINE_EXTENSIONS = [...JS_TS_EXTENSIONS, ".py", ".pyi", ".rs", ".go", ".mod"];
const CALL_UNSUPPORTED_EXTENSIONS = new Set([".html", ".htm", ".xhtml", ".sql"]);

describe("structural search operation support", () => {
  it("declares Python, Rust, and Go outline support", () => {
    expect(getStructuralSearchSupportedExtensions("outline")).toEqual(OUTLINE_EXTENSIONS);
  });

  it.each(["imports", "exports"] as const)(
    "declares only JavaScript and TypeScript extensions for %s",
    (operation) => {
      expect(getStructuralSearchSupportedExtensions(operation)).toEqual(JS_TS_EXTENSIONS);
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
