import type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/api";
import { describe, expect, it } from "vitest";

describe("CodePosition", () => {
  it("should be a constructable type with line and character", () => {
    const pos: CodePosition = { line: 0, character: 0 };
    expect(pos.line).toBe(0);
    expect(pos.character).toBe(0);
  });
});

describe("CodeLocation", () => {
  it("should be a constructable type with uri and range", () => {
    const loc: CodeLocation = {
      uri: "file:///x.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 1, character: 5 },
      },
    };
    expect(loc.uri).toBe("file:///x.ts");
    expect(loc.range.start.line).toBe(0);
    expect(loc.range.end.character).toBe(5);
  });
});
