import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_CHARACTERS,
  MAX_PAGE_LINES,
  MIN_PAGE_CHARACTERS,
  pageText,
} from "../../src/tool/output-page.ts";

describe("pageText", () => {
  it("bounds output and exposes an exact continuation offset", () => {
    const source = "α".repeat(20_000);
    const first = pageText(source);
    expect(first.text.length).toBeLessThanOrEqual(MAX_PAGE_CHARACTERS);
    expect(Buffer.byteLength(first.text, "utf8")).toBeLessThan(50_000);
    expect(first.nextOffset).toBeDefined();

    const second = pageText(source, first.nextOffset);
    const firstBody = first.text.split("\n\n[output paged;")[0];
    expect(firstBody + second.text).toBe(source);
  });

  it("rejects a page too small for continuation metadata", () => {
    expect(() => pageText("x".repeat(1_000), 0, MIN_PAGE_CHARACTERS - 1)).toThrow(
      /between 512 and 12000/,
    );
  });

  it("caps line count", () => {
    const page = pageText(Array.from({ length: 3_000 }, () => "x").join("\n"));
    expect(page.text.split("\n").length).toBeLessThanOrEqual(MAX_PAGE_LINES + 2);
    expect(page.nextOffset).toBeDefined();
  });
});
