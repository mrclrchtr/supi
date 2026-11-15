import { describe, expect, it } from "vitest";
import { buildStatsLeft } from "../../src/supi-footer-helpers.ts";

/** Marks each styled span as `<color:text>` so tests can assert tones. */
const mark = (color: string, text: string) => `<${color}:${text}>`;

const usage = {
  totalInput: 1000,
  totalOutput: 2000,
  totalCacheRead: 9000,
  totalCacheWrite: 0,
  totalCost: 1.5,
};

describe("buildStatsLeft", () => {
  it("groups tokens, cache, cost, and context with separators", () => {
    const plain = buildStatsLeft({
      contextWindow: 200_000,
      percent: 10,
      usage,
      useSubscription: false,
      contextBar: true,
      suffixParts: ["| lsp", "✦"],
    });
    expect(plain).toBe("↑1.0k ↓2.0k · R9.0k CH90.0% · $1.500 · ▰▱▱▱▱ 10.0%/200k · lsp · ✦");
  });

  it("colors cache hit rate and context usage by threshold", () => {
    const low = buildStatsLeft(
      {
        contextWindow: 100,
        percent: 95,
        usage: { ...usage, totalCacheRead: 100, totalInput: 900 },
        useSubscription: false,
        contextBar: true,
      },
      mark,
    );
    expect(low).toContain("<error:10.0%>");
    expect(low).toContain("<error:▰▰▰▰▰>");
    expect(low).toContain("<error:95.0%>");
  });

  it("omits the bar when disabled", () => {
    const text = buildStatsLeft({ contextWindow: 100, percent: 50, usage, useSubscription: false });
    expect(text).not.toContain("▰");
  });
});
