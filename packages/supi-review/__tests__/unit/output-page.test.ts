import { describe, expect, it } from "vitest";
import { MAX_PAGE_LINES, pageText } from "../../src/tool/output-page.ts";

describe("pageText", () => {
  it("bounds output and exposes an exact continuation offset", () => {
    const source = "α".repeat(20_000);
    const first = pageText(source);
    expect(Buffer.byteLength(first.text, "utf8")).toBeLessThan(50_000);
    expect(first.nextOffset).toBeDefined();

    const second = pageText(source, first.nextOffset);
    const firstBody = first.text.split("\n\n[output paged;")[0];
    expect(firstBody + second.text).toBe(source);
  });

  it("caps line count", () => {
    const page = pageText(Array.from({ length: 3_000 }, () => "x").join("\n"));
    expect(page.text.split("\n").length).toBeLessThanOrEqual(MAX_PAGE_LINES + 2);
    expect(page.nextOffset).toBeDefined();
  });
});
