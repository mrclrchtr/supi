import { describe, expect, it } from "vitest";
import { decorateOption } from "../src/format.ts";

describe("decorateOption", () => {
  it("does not double-append (recommended) when label already contains it", () => {
    expect(decorateOption("Two commits (recommended)", true)).toBe("Two commits (recommended)");
  });

  it("appends (recommended) when label does not contain it", () => {
    expect(decorateOption("Two commits", true)).toBe("Two commits (recommended)");
  });

  it("returns label unchanged when not recommended", () => {
    expect(decorateOption("Two commits", false)).toBe("Two commits");
  });

  it("handles case-insensitive match", () => {
    expect(decorateOption("Option (Recommended)", true)).toBe("Option (Recommended)");
  });
});
