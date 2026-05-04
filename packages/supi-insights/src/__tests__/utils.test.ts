import { describe, expect, it } from "vitest";
import {
  countCharInString,
  escapeHtmlWithBold,
  escapeXmlAttr,
  generateBarChartHtml,
  generateResponseTimeHistogramHtml,
  generateTimeOfDayChartHtml,
  getHourCountsJson,
  getLanguageFromPath,
  LABEL_MAP,
  SATISFACTION_ORDER,
} from "../utils.ts";

describe("getLanguageFromPath", () => {
  it("returns TypeScript for .ts files", () => {
    expect(getLanguageFromPath("src/index.ts")).toBe("TypeScript");
  });
  it("returns TypeScript for .tsx files", () => {
    expect(getLanguageFromPath("Component.tsx")).toBe("TypeScript");
  });
  it("returns JavaScript for .js", () => {
    expect(getLanguageFromPath("script.js")).toBe("JavaScript");
  });
  it("returns null for unknown extensions", () => {
    expect(getLanguageFromPath("Makefile")).toBeNull();
    expect(getLanguageFromPath("data.csv")).toBeNull();
  });
  it("is case-insensitive on extension", () => {
    expect(getLanguageFromPath("script.TS")).toBe("TypeScript");
  });
  it("handles paths with directory components", () => {
    expect(getLanguageFromPath("/a/b/c/main.py")).toBe("Python");
  });
});

describe("countCharInString", () => {
  it("counts newlines", () => {
    expect(countCharInString("a\nb\nc", "\n")).toBe(2);
  });
  it("returns 0 for no matches", () => {
    expect(countCharInString("abc", "\n")).toBe(0);
  });
  it("handles empty string", () => {
    expect(countCharInString("", "\n")).toBe(0);
  });
  it("counts any character", () => {
    expect(countCharInString("aaaa", "a")).toBe(4);
  });
});

describe("escapeXmlAttr", () => {
  it("escapes & < > \" '", () => {
    expect(escapeXmlAttr(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });
  it("passes through safe strings", () => {
    expect(escapeXmlAttr("hello world")).toBe("hello world");
  });
  it("handles empty string", () => {
    expect(escapeXmlAttr("")).toBe("");
  });
});

describe("escapeHtmlWithBold", () => {
  it("escapes HTML and converts **bold**", () => {
    expect(escapeHtmlWithBold("hello **world** & more")).toBe(
      "hello <strong>world</strong> &amp; more",
    );
  });
  it("handles multiple bold sections", () => {
    expect(escapeHtmlWithBold("**a** and **b**")).toBe("<strong>a</strong> and <strong>b</strong>");
  });
  it("handles no bold markers", () => {
    expect(escapeHtmlWithBold("plain text")).toBe("plain text");
  });
});

describe("generateBarChartHtml", () => {
  it("generates bar rows sorted by count descending", () => {
    const data = { apples: 10, bananas: 30, cherries: 20 };
    const html = generateBarChartHtml(data, "#ff0000");
    // Check order: Bananas (30) first, then Cherries (20), then Apples (10)
    const bananaIdx = html.indexOf("Bananas");
    const cherryIdx = html.indexOf("Cherries");
    const appleIdx = html.indexOf("Apples");
    expect(bananaIdx).toBeLessThan(cherryIdx);
    expect(cherryIdx).toBeLessThan(appleIdx);
    // Bananas at 100% width
    expect(html).toContain('style="width:100.0%');
  });

  it("returns empty message when data is empty", () => {
    const html = generateBarChartHtml({}, "#000");
    expect(html).toContain("No data");
  });

  it("respects maxItems limit", () => {
    const data = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
    const html = generateBarChartHtml(data, "#000", 3);
    // Should show only 3 items (g, f, e sorted by count)
    expect((html.match(/bar-row/g) || []).length).toBe(3);
  });

  it("uses fixedOrder when provided", () => {
    const data = { z: 10, a: 5, m: 8 };
    const html = generateBarChartHtml(data, "#000", 6, ["z", "m", "a"]);
    // fixedOrder should produce z, m, a in that order (labels get capitalized)
    expect(html.indexOf("Z</div>")).toBeLessThan(html.indexOf("M</div>"));
    expect(html.indexOf("M</div>")).toBeLessThan(html.indexOf("A</div>"));
  });

  it("applies LABEL_MAP transformations", () => {
    const data = { debug_investigate: 5 };
    const html = generateBarChartHtml(data, "#000");
    expect(html).toContain("Debug/Investigate");
  });
});

describe("generateResponseTimeHistogramHtml", () => {
  it("generates buckets with sorted times", () => {
    const times = [5, 15, 45, 120, 600, 2000];
    const html = generateResponseTimeHistogramHtml(times);
    expect(html).toContain("2-10s");
    expect(html).toContain("10-30s");
    expect(html).toContain(">15m");
    // 2000s goes into >15m
  });

  it("returns empty for no data", () => {
    expect(generateResponseTimeHistogramHtml([])).toContain("No response time data");
  });
});

// biome-ignore lint: false positive secret detection on test describe name
describe("generateTimeOfDayChartHtml", () => {
  it("groups hours into four periods", () => {
    const hours = [8, 9, 14, 15, 20, 21, 2, 3];
    const html = generateTimeOfDayChartHtml(hours);
    expect(html).toContain("Morning");
    expect(html).toContain("Afternoon");
    expect(html).toContain("Evening");
    expect(html).toContain("Night");
  });

  it("applies UTC offset", () => {
    // UTC hour 8 with offset -8 should be in Night (0-6)
    const html = generateTimeOfDayChartHtml([8], -8);
    // offset adjusts 8-8=0, which is in Night -> count 1 for Night period
    expect(html).toContain("Night");
    expect(html).toContain(">1<");
    // Morning (6-12) should have 0 since hour 8-8=0 is in Night
    expect(html).toContain("Morning");
    expect(html).toContain(">0<");
  });

  it("returns empty for no data", () => {
    expect(generateTimeOfDayChartHtml([])).toContain("No time data");
  });
});

describe("getHourCountsJson", () => {
  it("counts occurrences of each hour", () => {
    const json = getHourCountsJson([8, 8, 9, 10]);
    expect(JSON.parse(json)).toEqual({ "8": 2, "9": 1, "10": 1 });
  });

  it("returns empty object for empty array", () => {
    expect(JSON.parse(getHourCountsJson([]))).toEqual({});
  });
});

describe("LABEL_MAP", () => {
  it("contains expected label mappings", () => {
    expect(LABEL_MAP.debug_investigate).toBe("Debug/Investigate");
    expect(LABEL_MAP.fix_bug).toBe("Fix Bug");
    expect(LABEL_MAP.frustrated).toBe("Frustrated");
    expect(LABEL_MAP.fully_achieved).toBe("Fully Achieved");
    expect(LABEL_MAP.handled_complexity).toBe("Multi-file Changes");
    expect(LABEL_MAP.essential).toBe("Essential");
  });
});

describe("SATISFACTION_ORDER", () => {
  it("is ordered from negative to positive", () => {
    expect(SATISFACTION_ORDER).toEqual([
      "frustrated",
      "dissatisfied",
      "likely_satisfied",
      "satisfied",
      "happy",
      "unsure",
    ]);
  });
});
